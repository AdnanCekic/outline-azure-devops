declare module "@shared/types" {
  interface EmbedIntegrationSettings {
    azureDevOps?: {
      /** The Azure DevOps user that connected the integration. */
      user: { id: string; name: string; email?: string };
      /** The organizations the connected user is a member of. */
      organizations: Array<{ id: string; name: string }>;
    };
  }
}

export {};
