import { godotBindings } from "@/godot/bindings";

export class StringTable {
  private static strings: Record<string, string> = {};
  public static async initialize(): Promise<void> {
    const data = await godotBindings.getFile("", "eqstr_us.txt");
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