import Router from "@koa/router";
import { addSeconds } from "date-fns";
import { IntegrationService, IntegrationType } from "@shared/types";
import { toError } from "@shared/utils/error";
import { ValidationError } from "@server/errors";
import Logger from "@server/logging/Logger";
import apexAuthRedirect from "@server/middlewares/apexAuthRedirect";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { Integration, IntegrationAuthentication } from "@server/models";
import { authorize } from "@server/policies";
import type { APIContext } from "@server/types";
import { verifyOAuthStateNonce } from "@server/utils/oauth";
import {
  AzureDevOpsOAuthNonceCookie,
  AzureDevOpsUtils,
} from "../../shared/AzureDevOpsUtils";
import { AzureDevOps } from "../azuredevops";
import * as T from "./schema";

const router = new Router();

router.get(
  "azuredevops.callback",
  auth({
    optional: true,
  }),
  validate(T.AzureDevOpsCallbackSchema),
  apexAuthRedirect<T.AzureDevOpsCallbackReq>({
    getTeamId: (ctx) =>
      AzureDevOpsUtils.parseState(ctx.input.query.state)?.teamId,
    getRedirectPath: (ctx, team) =>
      AzureDevOpsUtils.callbackUrl({
        baseUrl: team.url,
        params: ctx.request.querystring,
      }),
    getErrorPath: () => AzureDevOpsUtils.errorUrl("unauthenticated"),
  }),
  transaction(),
  async (ctx: APIContext<T.AzureDevOpsCallbackReq>) => {
    const { code, error, state } = ctx.input.query;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;

    // Check error after any sub-domain redirection. Otherwise, the user will be redirected to the root domain.
    if (error) {
      ctx.redirect(AzureDevOpsUtils.errorUrl(error));
      return;
    }

    const parsedState = AzureDevOpsUtils.parseState(state);
    if (!parsedState) {
      throw ValidationError("Invalid state");
    }

    verifyOAuthStateNonce(ctx, AzureDevOpsOAuthNonceCookie, parsedState.nonce);
    authorize(user, "createIntegration", user.team);

    try {
      // validation middleware ensures that code is non-null at this point.
      const oauth = await AzureDevOps.oauthAccess(code ?? "");
      const profile = await AzureDevOps.getProfile(oauth.access_token);

      const authentication = await IntegrationAuthentication.create(
        {
          service: IntegrationService.AzureDevOps,
          userId: user.id,
          teamId: user.teamId,
          token: oauth.access_token,
          refreshToken: oauth.refresh_token,
          expiresAt: addSeconds(Date.now(), oauth.expires_in),
          scopes: oauth.scope.split(" "),
        },
        { transaction }
      );

      await Integration.create<Integration<IntegrationType.Embed>>(
        {
          service: IntegrationService.AzureDevOps,
          type: IntegrationType.Embed,
          userId: user.id,
          teamId: user.teamId,
          authenticationId: authentication.id,
          settings: {
            azureDevOps: profile,
          },
        },
        { transaction }
      );

      ctx.redirect(AzureDevOpsUtils.successUrl());
    } catch (err) {
      Logger.error(
        "Encountered error during Azure DevOps OAuth callback",
        toError(err)
      );
      ctx.redirect(AzureDevOpsUtils.errorUrl("unknown"));
    }
  }
);

export default router;
