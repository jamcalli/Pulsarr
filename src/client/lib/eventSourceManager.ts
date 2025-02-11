export interface ProgressEvent {
    operationId: string
    phase: string
    progress: number
    message: string
  }
  
  class EventSourceManager {
    private static instance: EventSourceManager
    private eventSource: EventSource | null = null
    private callbacks = new Map<string, Set<(event: ProgressEvent) => void>>()
  
    private constructor() {}
  
    static getInstance(): EventSourceManager {
      if (!EventSourceManager.instance) {
        EventSourceManager.instance = new EventSourceManager()
      }
      return EventSourceManager.instance
    }
  
    subscribe(operationId: string, callback: (event: ProgressEvent) => void): () => void {
      console.log(`[ESM] Subscribing to ${operationId}`)
      
      if (!this.callbacks.has(operationId)) {
        this.callbacks.set(operationId, new Set())
      }
      
      const callbacks = this.callbacks.get(operationId)!
      callbacks.add(callback)
  
      if (!this.eventSource) {
        this.connect()
      }
  
      return () => {
        console.log(`[ESM] Unsubscribing from ${operationId}`)
        const callbacks = this.callbacks.get(operationId)
        if (callbacks) {
          callbacks.delete(callback)
          if (callbacks.size === 0) {
            this.callbacks.delete(operationId)
          }
        }
  
        if (this.callbacks.size === 0) {
          this.disconnect()
        }
      }
    }
  
    private connect() {
      console.log('[ESM] Connecting to EventSource')
      if (this.eventSource) {
        console.log('[ESM] Connection already exists')
        return
      }
  
      this.eventSource = new EventSource('/api/progress')
      
      this.eventSource.onopen = () => {
        console.log('[ESM] Connection opened')
      }
      
      this.eventSource.onmessage = (event) => {
        console.log('[ESM] Received message:', event.data)
        try {
          const data: ProgressEvent = JSON.parse(event.data)
          console.log('[ESM] Parsed data:', data)
          
          const callbacks = this.callbacks.get(data.operationId)
          console.log(`[ESM] Found ${callbacks?.size || 0} callbacks for ${data.operationId}`)
          
          if (callbacks) {
            callbacks.forEach(callback => {
              console.log('[ESM] Executing callback for', data.operationId)
              callback(data)
            })
          }
          
          if (data.phase === 'complete') {
            console.log('[ESM] Received complete phase')
            setTimeout(() => {
              if (this.callbacks.size === 0) {
                this.disconnect()
              }
            }, 1000)
          }
        } catch (error) {
          console.error('[ESM] Error processing message:', error)
        }
      }
  
      this.eventSource.onerror = (error) => {
        console.error('[ESM] EventSource error:', error)
        this.disconnect()
      }
    }
  
    private disconnect() {
      console.log('[ESM] Disconnecting')
      if (!this.eventSource) {
        console.log('[ESM] No connection to disconnect')
        return
      }
      this.eventSource.close()
      this.eventSource = null
      console.log('[ESM] Disconnected')
    }
  
    isConnected(): boolean {
      return this.eventSource !== null
    }
  }
  
  export const eventSourceManager = EventSourceManager.getInstance()