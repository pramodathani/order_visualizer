import type { ChatAnswer } from './types';

const REQUESTED_WITH_HEADER = 'X-Requested-With';
const REQUESTED_WITH_VALUE = 'order-visualizer';

/** An error answer from the server, carrying its status code and message. */
export class ApiError extends Error {
  readonly statusCode: number;

  /**
   * Creates the error.
   * @param statusCode The HTTP status code.
   * @param message The server's explanation.
   */
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Calls the viewer's own server. */
export class ApiClient {
  /**
   * Asks whether this browser is logged in.
   * @returns True when the session is logged in.
   */
  async isLoggedIn(): Promise<boolean> {
    const response = await fetch('/api/auth/session', {
      credentials: 'same-origin',
    });
    const body = await this.readJson(response);
    return body.authenticated === true;
  }

  /**
   * Logs in with the viewer password.
   * @param password The password typed in.
   * @throws ApiError when the password is wrong or the address is locked out.
   */
  async logIn(password: string): Promise<void> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [REQUESTED_WITH_HEADER]: REQUESTED_WITH_VALUE,
      },
      body: JSON.stringify({
        password,
      }),
    });
    await this.readJson(response);
  }

  /** Logs out. */
  async logOut(): Promise<void> {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        [REQUESTED_WITH_HEADER]: REQUESTED_WITH_VALUE,
      },
    });
    await this.readJson(response);
  }

  /**
   * Asks whether the chat is switched on.
   * @returns Whether it is, and why not when it is not.
   */
  async chatStatus(): Promise<{ enabled: boolean; reason: string | null }> {
    const response = await fetch('/api/chat/status', {
      credentials: 'same-origin',
    });
    return (await this.readJson(response)) as unknown as { enabled: boolean; reason: string | null };
  }

  /**
   * Asks the chat a question.
   * @param conversationId The conversation to continue, or null to start one.
   * @param message The question.
   * @param view What the page shows now.
   * @returns The answer, its view commands and the conversation id.
   * @throws ApiError when the chat is switched off or Anthropic's API failed.
   */
  async chat(conversationId: string | null, message: string, view: Record<string, unknown>): Promise<ChatAnswer> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [REQUESTED_WITH_HEADER]: REQUESTED_WITH_VALUE,
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        message,
        view,
      }),
    });
    return (await this.readJson(response)) as unknown as ChatAnswer;
  }

  /**
   * Reads a JSON answer, turning an error status into an ApiError.
   * @param response The fetch response.
   * @returns The parsed body.
   * @throws ApiError when the status is not successful.
   */
  private async readJson(response: Response): Promise<Record<string, unknown>> {
    let body: Record<string, unknown> = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    if (!response.ok) {
      const detail = typeof body.detail === 'string' ? body.detail : response.statusText;
      throw new ApiError(response.status, detail);
    }
    return body;
  }
}

export const apiClient = new ApiClient();
