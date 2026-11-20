import queryString from "query-string";
import env from "@shared/env";
import { MentionType, UnfurlResourceType } from "@shared/types";
import { integrationSettingsPath } from "@shared/utils/routeHelpers";

export const AzureDevOpsOAuthNonceCookie = "azureDevOpsOAuthNonce";

export interface OAuthState {
  teamId: string;
  nonce: string;
}

/** A resource referenced by an Azure DevOps URL. */
export type AzureDevOpsResource =
  | {
      type: UnfurlResourceType.Issue;
      organization: string;
      project: string;
      id: number;
    }
  | {
      type: UnfurlResourceType.PR;
      organization: string;
      project: string;
      repository: string;
      id: number;
    };

/**
 * Helpers for the Azure DevOps integration that are shared between the client
 * and the server.
 */
export class AzureDevOpsUtils {
  /** The application ID of Azure DevOps in Microsoft Entra ID. */
  public static resourceId = "499b84ac-1321-427f-aa17-267ca6975798";

  /** The base URL of the Azure DevOps REST API. */
  public static apiBaseUrl = "https://dev.azure.com";

  /** The base URL of the Azure DevOps profile and accounts API. */
  public static vsspsBaseUrl = "https://app.vssps.visualstudio.com";

  /**
   * Returns the OAuth scopes requested from Microsoft Entra ID.
   *
   * @returns a space separated list of scopes.
   */
  public static oauthScopes() {
    return [
      `${this.resourceId}/vso.work`,
      `${this.resourceId}/vso.code`,
      `${this.resourceId}/vso.profile`,
      "offline_access",
    ].join(" ");
  }

  /**
   * Returns the Microsoft Entra ID tenant used for sign in, falling back to the
   * multi-tenant endpoint for work and school accounts.
   *
   * @returns the tenant ID or alias.
   */
  public static tenant() {
    return env.AZURE_DEVOPS_TENANT_ID || "organizations";
  }

  /**
   * Returns the Microsoft Entra ID token endpoint.
   *
   * @returns the token URL.
   */
  public static tokenUrl() {
    return `https://login.microsoftonline.com/${this.tenant()}/oauth2/v2.0/token`;
  }

  /**
   * Parses the OAuth state parameter.
   *
   * @param state the raw state parameter.
   * @returns the parsed state, or undefined if it is invalid.
   */
  public static parseState(state: string): OAuthState | undefined {
    try {
      return JSON.parse(state);
    } catch {
      return undefined;
    }
  }

  /**
   * Parses an Azure DevOps URL that references a work item or a pull request.
   * Supports dev.azure.com and legacy visualstudio.com URLs, and work items
   * opened from boards, backlogs and sprints.
   *
   * @param url the URL to parse.
   * @returns the referenced resource, or undefined if the URL is not supported.
   */
  public static parseUrl(url: string): AzureDevOpsResource | undefined {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return undefined;
    }

    if (parsed.protocol !== "https:") {
      return undefined;
    }

    const segments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => this.decode(segment));

    let organization: string | undefined;
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === "dev.azure.com") {
      organization = segments.shift();
    } else if (hostname.endsWith(".visualstudio.com")) {
      organization = hostname.slice(0, -".visualstudio.com".length);
      if (organization.includes(".")) {
        return undefined;
      }

      // Legacy URLs may include the default collection name.
      if (segments[0]?.toLowerCase() === "defaultcollection") {
        segments.shift();
      }
    } else {
      return undefined;
    }

    const project = segments.shift();
    if (!organization || !project || project.startsWith("_")) {
      return undefined;
    }

    const area = segments[0]?.toLowerCase();

    // Work item: /_workitems/edit/{id}
    if (area === "_workitems" && segments[1]?.toLowerCase() === "edit") {
      const id = this.parseId(segments[2]);
      return id
        ? { type: UnfurlResourceType.Issue, organization, project, id }
        : undefined;
    }

    // Pull request: /_git/{repository}/pullrequest/{id}
    if (area === "_git" && segments[2]?.toLowerCase() === "pullrequest") {
      const repository = segments[1];
      const id = this.parseId(segments[3]);
      return repository && id
        ? {
            type: UnfurlResourceType.PR,
            organization,
            project,
            repository,
            id,
          }
        : undefined;
    }

    // Work item opened from a board, backlog, sprint or query: ?workitem={id}
    const workItem = parsed.searchParams.get("workitem");
    if (workItem && area?.startsWith("_")) {
      const id = this.parseId(workItem);
      return id
        ? { type: UnfurlResourceType.Issue, organization, project, id }
        : undefined;
    }

    return undefined;
  }

  /**
   * Determines the type of mention an Azure DevOps URL represents.
   *
   * @param url the URL to evaluate.
   * @returns the mention type, or undefined if the URL is not supported.
   */
  public static mentionType(url: URL): MentionType | undefined {
    switch (this.parseUrl(url.toString())?.type) {
      case UnfurlResourceType.Issue:
        return MentionType.Issue;
      case UnfurlResourceType.PR:
        return MentionType.PullRequest;
      default:
        return undefined;
    }
  }

  /**
   * Returns the color for the category of a work item state, used when Azure
   * DevOps does not provide a color for the state.
   *
   * @param category the state category, eg "InProgress".
   * @returns a hex color string.
   */
  public static getColorForCategory(category?: string): string {
    const colors: Record<string, string> = {
      Proposed: "#b2b2b2",
      InProgress: "#007acc",
      Resolved: "#ff9d00",
      Completed: "#339933",
      Removed: "#848d97",
    };
    return (category && colors[category]) ?? "#848d97";
  }

  /**
   * Returns the color for the status of a pull request.
   *
   * @param status the pull request status.
   * @param isDraft whether the pull request is a draft.
   * @returns a hex color string.
   */
  public static getColorForPullRequest(
    status: string,
    isDraft: boolean = false
  ): string {
    const colors: Record<string, string> = {
      active: isDraft ? "#848d97" : "#1f75cb",
      completed: "#8250df",
      abandoned: "#f85149",
    };
    return colors[status] ?? "#848d97";
  }

  /**
   * Returns the URL to redirect to after the integration was connected.
   *
   * @returns the settings URL.
   */
  public static successUrl() {
    return this.settingsUrl;
  }

  /**
   * Returns the URL to redirect to when connecting the integration failed.
   *
   * @param error the error code.
   * @returns the settings URL with the error code.
   */
  public static errorUrl(error: string) {
    return `${this.settingsUrl}?error=${error}`;
  }

  /**
   * Returns the OAuth callback URL.
   *
   * @param options.baseUrl the base URL of the team.
   * @param options.params the query string to append.
   * @returns the callback URL.
   */
  public static callbackUrl(
    { baseUrl, params }: { baseUrl: string; params?: string } = {
      baseUrl: env.URL,
      params: undefined,
    }
  ) {
    return params
      ? `${baseUrl}/api/azuredevops.callback?${params}`
      : `${baseUrl}/api/azuredevops.callback`;
  }

  /**
   * Returns the Microsoft Entra ID authorization URL.
   *
   * @param options.state the OAuth state.
   * @returns the authorization URL.
   */
  public static authUrl({ state }: { state: OAuthState }) {
    const params = {
      client_id: env.AZURE_DEVOPS_CLIENT_ID,
      redirect_uri: this.callbackUrl(),
      response_type: "code",
      response_mode: "query",
      scope: this.oauthScopes(),
      state: JSON.stringify(state),
      prompt: "select_account",
    };
    return `https://login.microsoftonline.com/${this.tenant()}/oauth2/v2.0/authorize?${queryString.stringify(params)}`;
  }

  private static settingsUrl = integrationSettingsPath("azuredevops");

  private static parseId(value: string | undefined) {
    if (!value || !/^\d+$/.test(value)) {
      return undefined;
    }
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
  }

  private static decode(segment: string) {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }
}
