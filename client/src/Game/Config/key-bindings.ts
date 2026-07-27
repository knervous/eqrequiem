const keyAliases: Record<string, string> = {
  " ": "Space",
  Control: "Ctrl",
  Escape: "Esc",
};

export const keyboardEventToBinding = (event: KeyboardEvent): string => {
  const modifiers = [
    event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    event.metaKey ? "Meta" : "",
  ].filter(Boolean);
  const key = keyAliases[event.key] ?? (
    event.key.length === 1 ? event.key.toUpperCase() : event.key
  );
  if (!["Ctrl", "Alt", "Shift", "Meta"].includes(key)) modifiers.push(key);
  return modifiers.join("+");
};

export const bindingToCode = (binding: string): string | null => {
  if (binding.includes("+")) return null;
  if (/^[A-Z]$/i.test(binding)) return `Key${binding.toUpperCase()}`;
  if (/^[0-9]$/.test(binding)) return `Digit${binding}`;
  const aliases: Record<string, string> = {
    Space: "Space",
    Ctrl: "ControlLeft",
    Shift: "ShiftLeft",
    Alt: "AltLeft",
    Tab: "Tab",
  };
  return aliases[binding] ?? binding;
};
