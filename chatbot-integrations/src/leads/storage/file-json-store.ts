import fs from 'fs'
import path from 'path'

export class FileJsonStore<T> {
  private readonly _filePath: string
  private readonly _initialValue: T

  constructor(filePath: string, initialValue: T) {
    this._filePath = filePath
    this._initialValue = initialValue
    this._ensureFile()
  }

  public read(): T {
    this._ensureFile()
    const raw = fs.readFileSync(this._filePath, 'utf8')
    return JSON.parse(raw) as T
  }

  public write(value: T): void {
    this._ensureFile()
    fs.writeFileSync(this._filePath, JSON.stringify(value, null, 2) + '\n', 'utf8')
  }

  public update(updater: (current: T) => T): T {
    const next = updater(this.read())
    this.write(next)
    return next
  }

  private _ensureFile(): void {
    fs.mkdirSync(path.dirname(this._filePath), { recursive: true })
    if (!fs.existsSync(this._filePath)) {
      fs.writeFileSync(this._filePath, JSON.stringify(this._initialValue, null, 2) + '\n', 'utf8')
    }
  }
}
