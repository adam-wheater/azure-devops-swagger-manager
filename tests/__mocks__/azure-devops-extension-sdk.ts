const mockServices: Record<string, any> = {};
const mockAccessToken = "mock-access-token";
const mockExtensionContext = { id: "mock-extension-id" };
const mockUser = { id: "mock-user-id", displayName: "Test User" };

export function getService<T>(serviceId: string): Promise<T> {
  return Promise.resolve(mockServices[serviceId] as T);
}

export function getAccessToken(): Promise<string> {
  return Promise.resolve(mockAccessToken);
}

export function getExtensionContext(): { id: string } {
  return mockExtensionContext;
}

export function getUser(): { id: string; displayName: string } {
  return mockUser;
}

export function getHost(): { id: string; name: string } {
  return { id: "mock-host-id", name: "mock-org" };
}

export function init(): Promise<void> {
  return Promise.resolve();
}

export function ready(): Promise<void> {
  return Promise.resolve();
}

export function __setMockService(serviceId: string, service: any): void {
  mockServices[serviceId] = service;
}

export function __resetMockServices(): void {
  for (const key of Object.keys(mockServices)) {
    delete mockServices[key];
  }
}
