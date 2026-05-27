export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  timestamp?: string;
}

export interface ToolStep {
  tool: string;
  action: string;
  summary: string;
}

export interface AgentChatResponse {
  sessionId: string;
  reply: string;
  messages: AgentMessage[];
  toolSteps: ToolStep[];
}

export interface PricingAlert {
  id: string;
  propertyId: 'ranch' | 'lindon';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  suggestedAction?: string;
  createdAt: string;
  dismissed?: boolean;
}

export interface CompListing {
  id: string;
  platform: 'airbnb' | 'vrbo';
  url: string;
  label: string;
  propertyId?: 'ranch' | 'lindon' | 'both';
}
