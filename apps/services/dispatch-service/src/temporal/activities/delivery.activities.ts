export async function recordPickup(_shipmentId: string): Promise<void> {}
export async function processStatusUpdate(_shipmentId: string): Promise<void> {}
export async function recordDeliveryAttempt(_shipmentId: string): Promise<void> {}
export async function confirmDelivery(_shipmentId: string): Promise<void> {}
export async function triggerPostDelivery(_shipmentId: string): Promise<void> {}
