import { FormEvent, useState } from 'react';
import { CommandParser } from '@game/ChatCommands/command-parser';

const EXAMPLES = [
  '#help',
  '#zone qeynos2',
  '#level 50',
  '#searchitem fine steel',
  '#summonitem 1001',
  '#gearup',
];

export const GmCommandDeveloper: React.FC = () => {
  const [command, setCommand] = useState('#help');
  const [history, setHistory] = useState<string[]>([]);

  const execute = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    const gmCommand = value.startsWith('#') ? value : `#${value}`;
    CommandParser.parseCommand(gmCommand);
    setHistory((current) => [gmCommand, ...current].slice(0, 12));
    setCommand('');
  };

  return (
    <div className="rq-gm-command">
      <p>
        Run a registered GM command through the same command path as chat.
      </p>
      <form onSubmit={execute}>
        <input
          aria-label="GM command"
          autoComplete="off"
          onChange={(event) => setCommand(event.target.value)}
          placeholder="#help or #zone qeynos2"
          spellCheck={false}
          value={command}
        />
        <button type="submit">Run</button>
      </form>
      <div className="rq-gm-command__examples" aria-label="GM command examples">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" onClick={() => setCommand(example)}>
            {example}
          </button>
        ))}
      </div>
      <h3>Session history</h3>
      {history.length ? (
        <ol className="rq-gm-command__history">
          {history.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ol>
      ) : (
        <p className="rq-empty-state">No GM commands run this session.</p>
      )}
    </div>
  );
};
