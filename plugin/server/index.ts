import { IntegrationService } from "@shared/types";
import { Minute } from "@shared/utils/time";
import { Hook, PluginManager } from "@server/utils/PluginManager";
import config from "../plugin.json";
import { AzureDevOpsUtils } from "../shared/AzureDevOpsUtils";
import router from "./api/azuredevops";
import { AzureDevOps } from "./azuredevops";
import env from "./env";

PluginManager.add({
  type: Hook.IntegrationSettings,
  value: { service: IntegrationService.AzureDevOps, keys: ["azureDevOps"] },
});

const enabled =
  !!env.AZURE_DEVOPS_CLIENT_ID && !!env.AZURE_DEVOPS_CLIENT_SECRET;

if (enabled) {
  PluginManager.add([
    {
      ...config,
      type: Hook.API,
      value: router,
    },
    {
      type: Hook.UnfurlProvider,
      name: "Azure DevOps",
      value: { unfurl: AzureDevOps.unfurl, cacheExpiry: Minute.seconds },
    },
    {
      type: Hook.MentionProvider,
      value: (url: URL) => AzureDevOpsUtils.mentionType(url),
    },
  ]);
}
