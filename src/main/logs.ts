import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'

export class EngineLog {
  private stream: WriteStream | undefined

  constructor(private readonly dir: string) {}

  open(): string {
    mkdirSync(this.dir, { recursive: true })
    const stamp = new Date().toISOString().slice(0, 10)
    const file = join(this.dir, `engine-${stamp}.log`)
    this.stream = createWriteStream(file, { flags: 'a' })
    this.write('log', `opened ${file}`)
    return file
  }

  get directory(): string {
    return this.dir
  }

  write(source: string, text: string): void {
    const line = `[${new Date().toISOString()}] [${source}] ${text.replace(/\s+$/, '')}\n`
    this.stream?.write(line)
  }

  close(): void {
    this.stream?.end()
    this.stream = undefined
  }
}
