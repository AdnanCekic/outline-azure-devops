import { z } from "zod";
import type { IntegrationType } from "@shared/types";
import { IntegrationService, UnfurlResourceType } from "@shared/types";
import { errToString, toError } from "@shared/utils/error";
import { Second } from "@shared/utils/time";
import Logger from "@server/logging/Logger";
import { Integration } from "@server/models";
import type User from "@server/models/User";
import type { UnfurlIssueOrPR, UnfurlSignature } from "@server/types";
import fetch from "@server/utils/fetch";
import {
  type AzureDevOpsResource,
  AzureDevOpsUtils,
} from "../shared/AzureDevOpsUtils";
import env from "./env";

const AccessTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  token_type: z.string(),
  expires_in: z.number(),
  scope: z.string(),
});

const ProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  emailAddress: z.string().optional(),
});

const AccountsSchema = z.object({
  value: z.array(
    z.object({
      accountId: z.string(),
      accountName: z.string(),
    })
  ),
});

const IdentitySchema = z
  .object({
    displayName: z.string(),
  })
  .nullish();

const WorkItemSchema = z.object({
  id: z.number(),
  fields: z.object({
    "System.Title": z.string(),
    "System.State": z.string(),
    "System.WorkItemType": z.string(),
    "System.CreatedDate": z.string(),
    "System.CreatedBy": IdentitySchema,
    "System.Description": z.string().nullish(),
    "System.Tags": z.string().nullish(),
  }),
  _links: z
    .object({
      html: z.object({ href: z.string() }).optional(),
    })
    .optional(),
});

const WorkItemStatesSchema = z.object({
  value: z.array(
    z.object({
      name: z.string(),
      color: z.string().optional(),
      category: z.string().optional(),
    })
  ),
});

const PullRequestSchema = z.object({
  pullRequestId: z.number(),
  title: z.string(),
  description: z.string().nullish(),
  status: z.string(),
  isDraft: z.boolean().optional(),
  creationDate: z.string(),
  createdBy: IdentitySchema,
});

/** Azure DevOps API client used for OAuth and link unfurling. */
export class AzureDevOps {
  /**
   * Unfurls an Azure DevOps work item or pull request URL.
   *
   * @param url the Azure DevOps resource URL.
   * @param actor the user attempting to unfurl the URL.
   * @returns the resource details, an error, or undefined if the URL is not supported.
   */
  public static unfurl: UnfurlSignature = async (url: string, actor?: User) => {
    const resource = AzureDevOpsUtils.parseUrl(url);

    if (!resource || !actor) {
      return;
    }

    const integrations = (await Integration.scope("withAuthentication").findAll(
      {
        where: {
          service: IntegrationService.AzureDevOps,
          teamId: actor.teamId,
        },
      }
    )) as Integration<IntegrationType.Embed>[];

    if (integrations.length === 0) {
      return;
    }

    // Prefer an integration whose user is a member of the organization.
    const organization = resource.organization.toLowerCase();
    const integration =
      integrations.find((int) =>
        int.settings.azureDevOps?.organizations.some(
          (org) => org.name.toLowerCase() === organization
        )
      ) ?? integrations[0];

    try {
      const accessToken = await integration.authentication.refreshTokenIfNeeded(
        async (refreshToken: string) => AzureDevOps.refreshToken(refreshToken)
      );

      switch (resource.type) {
        case UnfurlResourceType.Issue:
          return await AzureDevOps.unfurlWorkItem(accessToken, resource, url);
        case UnfurlResourceType.PR:
          return await AzureDevOps.unfurlPullRequest(
            accessToken,
            resource,
            url
          );
        default:
          return;
      }
    } catch (err) {
      Logger.warn("Failed to fetch resource from Azure DevOps", toError(err));
      return { error: errToString(err) || "Unknown error" };
    }
  };

  /**
   * Exchanges an authorization code for an access token.
   *
   * @param code the authorization code from the OAuth callback.
   * @returns the parsed token response.
   * @throws if the token request fails.
   */
  public static async oauthAccess(code: string) {
    return this.requestToken({
      code,
      grant_type: "authorization_code",
      redirect_uri: AzureDevOpsUtils.callbackUrl(),
    });
  }

  /**
   * Refreshes an access token.
   *
   * @param refreshToken the refresh token.
   * @returns the parsed token response.
   * @throws if the token request fails.
   */
  public static async refreshToken(refreshToken: string) {
    return this.requestToken({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
  }

  /**
   * Loads the profile of the connected user and the organizations they are a
   * member of.
   *
   * @param accessToken the access token.
   * @returns the user profile and organizations.
   * @throws if a request fails.
   */
  public static async getProfile(accessToken: string) {
    const profile = await this.request({
      accessToken,
      url: `${AzureDevOpsUtils.vsspsBaseUrl}/_apis/profile/profiles/me?api-version=7.1`,
      schema: ProfileSchema,
    });

    const accounts = await this.request({
      accessToken,
      url: `${AzureDevOpsUtils.vsspsBaseUrl}/_apis/accounts?memberId=${encodeURIComponent(profile.id)}&api-version=7.1`,
      schema: AccountsSchema,
    });

    return {
      user: {
        id: profile.id,
        name: profile.displayName,
        email: profile.emailAddress,
      },
      organizations: accounts.value.map((account) => ({
        id: account.accountId,
        name: account.accountName,
      })),
    };
  }

  /** The time to wait for a response from Azure DevOps. */
  private static timeout = 10 * Second.ms;

  /** The maximum length of a description included in a preview. */
  private static maxDescriptionLength = 1000;

  private static async unfurlWorkItem(
    accessToken: string,
    resource: Extract<AzureDevOpsResource, { type: UnfurlResourceType.Issue }>,
    url: string
  ) {
    const base = this.projectUrl(resource);
    const workItem = await this.request({
      accessToken,
      url: `${base}/_apis/wit/workitems/${resource.id}?api-version=7.1`,
      schema: WorkItemSchema,
    });

    const { fields } = workItem;
    const state = await this.getWorkItemState(
      accessToken,
      base,
      fields["System.WorkItemType"],
      fields["System.State"]
    );

    return {
      type: UnfurlResourceType.Issue,
      url: workItem._links?.html?.href ?? url,
      id: `${fields["System.WorkItemType"]} ${workItem.id}`,
      title: fields["System.Title"],
      description: this.htmlToText(fields["System.Description"]),
      author: {
        name: fields["System.CreatedBy"]?.displayName ?? "",

        // Azure DevOps avatars require authentication and cannot be shown.
        avatarUrl: "",
      },
      labels: (fields["System.Tags"] ?? "")
        .split(";")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => ({ name: tag, color: "#848d97" })),
      state: {
        type: state.category,
        name: fields["System.State"],
        color: state.color,
      },
      createdAt: fields["System.CreatedDate"],
    } satisfies UnfurlIssueOrPR;
  }

  private static async unfurlPullRequest(
    accessToken: string,
    resource: Extract<AzureDevOpsResource, { type: UnfurlResourceType.PR }>,
    url: string
  ) {
    const base = this.projectUrl(resource);
    const pr = await this.request({
      accessToken,
      url: `${base}/_apis/git/repositories/${encodeURIComponent(resource.repository)}/pullrequests/${resource.id}?api-version=7.1`,
      schema: PullRequestSchema,
    });

    const draft = !!pr.isDraft;

    return {
      type: UnfurlResourceType.PR,
      url,
      id: `!${pr.pullRequestId}`,
      title: pr.title,
      description: this.truncate(pr.description ?? ""),
      author: {
        name: pr.createdBy?.displayName ?? "",

        // Azure DevOps avatars require authentication and cannot be shown.
        avatarUrl: "",
      },
      state: {
        name: pr.status,
        color: AzureDevOpsUtils.getColorForPullRequest(pr.status, draft),
        draft,
      },
      createdAt: pr.creationDate,
    } satisfies UnfurlIssueOrPR;
  }

  /**
   * Loads the color and category of a work item state. Falls back to a color
   * based on the state name when the states cannot be loaded.
   */
  private static async getWorkItemState(
    accessToken: string,
    base: string,
    workItemType: string,
    stateName: string
  ) {
    try {
      const states = await this.request({
        accessToken,
        url: `${base}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}/states?api-version=7.1`,
        schema: WorkItemStatesSchema,
      });
      const state = states.value.find((s) => s.name === stateName);

      if (state) {
        return {
          category: state.category,
          color: state.color
            ? `#${state.color}`
            : AzureDevOpsUtils.getColorForCategory(state.category),
        };
      }
    } catch (err) {
      Logger.debug(
        "plugins",
        `Failed to load Azure DevOps work item states: ${errToString(err)}`
      );
    }

    return {
      category: undefined,
      color: AzureDevOpsUtils.getColorForCategory(),
    };
  }

  private static projectUrl(resource: AzureDevOpsResource) {
    return `${AzureDevOpsUtils.apiBaseUrl}/${encodeURIComponent(resource.organization)}/${encodeURIComponent(resource.project)}`;
  }

  private static async request<T extends z.ZodType>({
    accessToken,
    url,
    schema,
  }: {
    accessToken: string;
    url: string;
    schema: T;
  }): Promise<z.infer<T>> {
    const res = await fetch(url, {
      timeout: this.timeout,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(
        `Error while requesting resource from Azure DevOps; status: ${res.status}`
      );
    }

    return schema.parse(await res.json());
  }

  private static async requestToken(params: Record<string, string>) {
    const body = new URLSearchParams({
      ...params,
      client_id: env.AZURE_DEVOPS_CLIENT_ID ?? "",
      client_secret: env.AZURE_DEVOPS_CLIENT_SECRET ?? "",
      scope: AzureDevOpsUtils.oauthScopes(),
    });

    const res = await fetch(AzureDevOpsUtils.tokenUrl(), {
      method: "POST",
      timeout: this.timeout,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });

    if (res.status !== 200) {
      throw new Error(
        `Error while requesting access token from Microsoft Entra ID; status: ${res.status}`
      );
    }

    return AccessTokenResponseSchema.parse(await res.json());
  }

  private static htmlToText(html: string | null | undefined) {
    if (!html) {
      return null;
    }

    const text = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, "&")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return text ? this.truncate(text) : null;
  }

  private static truncate(text: string) {
    return text.length > this.maxDescriptionLength
      ? `${text.slice(0, this.maxDescriptionLength)}…`
      : text;
  }
}
