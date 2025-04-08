
export class StringTable {
  private static strings: Record<string, string> = {};
  public static async initialize(getEQFile: (folder: string, path: string) => Promise<ArrayBuffer | null>): Promise<void> {
    const data = await getEQFile("", "eqstr_us.txt");
    console.log('data', data);
    if (data) {
      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(data);
      const lines = text.split("\n");
      for (const line of lines) {
        const [key, ...value] = line.split(" ");
        if (!isNaN(+key) && value.length) {
          this.strings[key.trim()] = value.join(' ').trim().replaceAll('<BR>', '\n');
        }
      }
    }

  }
  public static getString (key: string): string | undefined {
    return this.strings[key];
  }
}