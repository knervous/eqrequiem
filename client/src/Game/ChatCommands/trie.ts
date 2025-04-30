// --- trie.ts ---
export interface CommandEntry {
    method: string;
    instance: any;
  }
  
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  // Marks the end of a valid command
  entry: CommandEntry | null = null;
}
  
export class Trie {
  private root = new TrieNode();
  
  /** Insert a full command string into the trie */
  insert(command: string, method: string, instance: any): void {
    let node = this.root;
    for (const ch of command) {
      if (!node.children.has(ch)) {
        node.children.set(ch, new TrieNode());
      }
      node = node.children.get(ch)!;
    }
    node.entry = { method, instance };
  }
  
  /** Exact lookup */
  searchExact(command: string): CommandEntry | null {
    let node = this.root;
    for (const ch of command) {
      if (!node.children.has(ch)) {
        return null;
      }
      node = node.children.get(ch)!;
    }
    return node.entry;
  }
  
  /** Find all commands that start with the given prefix */
  searchPrefix(prefix: string): { command: string, entry: CommandEntry }[] {
    let node = this.root;
    for (const ch of prefix) {
      node = node.children.get(ch)!;
      if (!node) return [];
    }
    // Now collect all entries in this subtree
    const results: { command: string, entry: CommandEntry }[] = [];
    const dfs = (n: TrieNode, path: string) => {
      if (n.entry) {
        results.push({ command: prefix + path, entry: n.entry });
      }
      for (const [c, child] of n.children) {
        dfs(child, path + c);
      }
    };
    dfs(node, '');
    return results;
  }
}
  