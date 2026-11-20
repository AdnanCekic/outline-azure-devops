import { IsOptional } from "class-validator";
import { Environment } from "@server/env";
import { Public } from "@server/utils/decorators/Public";
import environment from "@server/utils/environment";
import { CannotUseWithout } from "@server/utils/validators";

class AzureDevOpsPluginEnvironment extends Environment {
  /**
   * Microsoft Entra ID application (client) ID. To enable integration with
   * Azure DevOps.
   */
  @Public
  @IsOptional()
  public AZURE_DEVOPS_CLIENT_ID = this.toOptionalString(
    environment.AZURE_DEVOPS_CLIENT_ID
  );

  /**
   * Microsoft Entra ID application client secret. To enable integration with
   * Azure DevOps.
   */
  @IsOptional()
  @CannotUseWithout("AZURE_DEVOPS_CLIENT_ID")
  public AZURE_DEVOPS_CLIENT_SECRET = this.toOptionalString(
    environment.AZURE_DEVOPS_CLIENT_SECRET
  );

  /**
   * Microsoft Entra ID tenant (directory) ID that the Azure DevOps
   * organizations are connected to. Required for single-tenant applications,
   * defaults to the multi-tenant "organizations" endpoint.
   */
  @Public
  @IsOptional()
  @CannotUseWithout("AZURE_DEVOPS_CLIENT_ID")
  public AZURE_DEVOPS_TENANT_ID = this.toOptionalString(
    environment.AZURE_DEVOPS_TENANT_ID
  );
}

export default new AzureDevOpsPluginEnvironment();
