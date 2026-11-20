import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation, Trans } from "react-i18next";
import { IntegrationService } from "@shared/types";
import { ConnectedButton } from "~/scenes/Settings/components/ConnectedButton";
import { IntegrationScene } from "~/scenes/Settings/components/IntegrationScene";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import List from "~/components/List";
import ListItem from "~/components/List/Item";
import Notice from "~/components/Notice";
import PlaceholderText from "~/components/PlaceholderText";
import Text from "~/components/Text";
import Time from "~/components/Time";
import env from "~/env";
import useQuery from "~/hooks/useQuery";
import useStores from "~/hooks/useStores";
import AzureDevOpsIcon from "./Icon";
import { AzureDevOpsConnectButton } from "./components/AzureDevOpsButton";

function AzureDevOps() {
  const { integrations } = useStores();
  const { t } = useTranslation();
  const azureDevOpsIntegrations = integrations.filterByService(
    IntegrationService.AzureDevOps
  );
  const query = useQuery();
  const error = query.get("error");
  const appName = env.APP_NAME;

  React.useEffect(() => {
    void integrations.fetchAllIfNeeded({
      service: IntegrationService.AzureDevOps,
      withRelations: true,
    });
  }, [integrations]);

  return (
    <IntegrationScene title="Azure DevOps" icon={<AzureDevOpsIcon />}>
      <Heading>Azure DevOps</Heading>

      {error === "access_denied" && (
        <Notice>
          <Trans>
            Whoops, you need to accept the permissions in Microsoft to connect{" "}
            {{ appName }} to Azure DevOps. Try again?
          </Trans>
        </Notice>
      )}
      {error === "unauthenticated" && (
        <Notice>
          <Trans>
            Something went wrong while authenticating your request. Please try
            logging in again.
          </Trans>
        </Notice>
      )}
      {error === "unknown" && (
        <Notice>
          <Trans>
            Something went wrong while processing your request. Please try
            again.
          </Trans>
        </Notice>
      )}
      {env.AZURE_DEVOPS_CLIENT_ID ? (
        <>
          <Text as="p">
            <Trans>
              Enable previews of Azure DevOps work items and pull requests in
              documents by connecting an Azure DevOps account to {{ appName }}.
            </Trans>
          </Text>
          {azureDevOpsIntegrations.length ? (
            <>
              <Heading as="h2">
                <Flex justify="space-between" auto>
                  {t("Connected")}
                  <AzureDevOpsConnectButton icon={<PlusIcon />} />
                </Flex>
              </Heading>
              <List>
                {azureDevOpsIntegrations.map((integration) => {
                  const settings = integration.settings?.azureDevOps;
                  const organizations = settings?.organizations
                    .map((org) => org.name)
                    .join(", ");
                  const integrationCreatedBy = integration.user
                    ? integration.user.name
                    : undefined;

                  return (
                    <ListItem
                      key={integration.id}
                      small
                      title={organizations || settings?.user.name}
                      subtitle={
                        integrationCreatedBy ? (
                          <>
                            <Trans>Enabled by {{ integrationCreatedBy }}</Trans>{" "}
                            &middot;{" "}
                            <Time
                              dateTime={integration.createdAt}
                              relative={false}
                              format={{ en_US: "MMMM d, y" }}
                            />
                          </>
                        ) : (
                          <PlaceholderText />
                        )
                      }
                      image={<AzureDevOpsIcon size={32} />}
                      actions={
                        <ConnectedButton
                          onClick={integration.delete}
                          confirmationMessage={t(
                            "Disconnecting will prevent previewing Azure DevOps links from these organizations in documents. Are you sure?"
                          )}
                        />
                      }
                    />
                  );
                })}
              </List>
            </>
          ) : (
            <p>
              <AzureDevOpsConnectButton icon={<AzureDevOpsIcon />} />
            </p>
          )}
        </>
      ) : (
        <Notice>
          <Trans>
            The Azure DevOps integration is currently disabled. Please set the
            associated environment variables and restart the server to enable
            the integration.
          </Trans>
        </Notice>
      )}
    </IntegrationScene>
  );
}

export default observer(AzureDevOps);
