import type { IntegrationSettings, IntegrationType } from "@shared/types";
import { IntegrationService } from "@shared/types";
import { createLazyComponent } from "~/components/LazyLoad";
import { Hook, PluginManager } from "~/utils/PluginManager";
import config from "../plugin.json";
import { AzureDevOpsUtils } from "../shared/AzureDevOpsUtils";
import Icon from "./Icon";

PluginManager.add([
  {
    ...config,
    type: Hook.Settings,
    value: {
      group: "Integrations",
      icon: Icon,
      description:
        "Connect Azure DevOps to Outline to enable rich previews of work items and pull requests inside documents.",
      component: createLazyComponent(() => import("./Settings")),
    },
  },
  {
    ...config,
    type: Hook.MentionProvider,
    value: {
      service: IntegrationService.AzureDevOps,
      isMentionable: (url, integration) => {
        const settings =
          integration.settings as IntegrationSettings<IntegrationType.Embed>;
        const resource = AzureDevOpsUtils.parseUrl(url.toString());

        if (!resource) {
          return false;
        }

        // Ensure the connected account is a member of the organization.
        const organization = resource.organization.toLowerCase();
        return !!settings.azureDevOps?.organizations.some(
          (org) => org.name.toLowerCase() === organization
        );
      },
      mentionType: (url) => AzureDevOpsUtils.mentionType(url),
    },
  },
]);
