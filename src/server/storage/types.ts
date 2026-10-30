/**
 * 存储抽象。当前实现是本地磁盘（Docker 里挂卷），
 * 将来换 S3 只需要换掉这一个文件的实现。
 */
export interface Storage {
  /** 存文件。key 由实现生成——服务端决定文件名，不用调用方给的。 */
  put(bytes: Buffer, mime: string, ext: string): Promise<{ storedPath: string; url: string }>
  delete(storedPath: string): Promise<void>
}
