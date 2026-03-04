import { z } from "zod";

// Configuration schema for external integrations
export const IntegrationConfigSchema = z.object({
  slack: z.object({
    enabled: z.boolean(),
    token: z.string().optional(),
    signingSecret: z.string().optional(),
    defaultChannel: z.string().optional(),
  }),
  google: z.object({
    enabled: z.boolean(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    redirectUri: z.string().optional(),
    scopes: z.array(z.string()).default([
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/gmail.send'
    ]),
  }),
  dropbox: z.object({
    enabled: z.boolean(),
    appKey: z.string().optional(),
    appSecret: z.string().optional(),
    accessToken: z.string().optional(),
  })
});

export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

// Default configuration
export const defaultConfig: IntegrationConfig = {
  slack: {
    enabled: false,
  },
  google: {
    enabled: false,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/gmail.send'
    ],
  },
  dropbox: {
    enabled: false,
  }
};
