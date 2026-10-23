declare module 'sherpa-onnx-node' {
  export const OfflineRecognizer: {
    createAsync(config: unknown): Promise<unknown>
  }
}

declare module '*?raw' {
  const content: string
  export default content
}
