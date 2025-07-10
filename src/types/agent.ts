import * as vscode from 'vscode';
import { CoreMessage } from 'ai';

export interface AgentService {
    query(
        prompt?: string,
        messages?: CoreMessage[],
        options?: any,
        abortController?: AbortController,
        onMessage?: (message: any) => void
    ): Promise<any[]>;
    
    hasApiKey(): boolean;
    isApiKeyAuthError(errorMessage: string): boolean;
    clearSession?(): void;
}

 