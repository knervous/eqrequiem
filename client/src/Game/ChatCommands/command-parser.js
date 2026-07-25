import { CommandHandler } from './command-handler';
import { GMCommandHandler } from './gm-command-handler';
export class CommandParser {
    static parseCommand(command) {
        if (!command || command.trim() === '') {
            return;
        }
        let handler = CommandHandler.instance();
        switch (command[0]) {
            case '/':
                command = command.slice(1);
                break;
            case '#':
                command = command.slice(1);
                handler = GMCommandHandler.instance();
                break;
            default:
                command = `say ${command}`;
                break;
        }
        handler.parseCommand(command);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZC1wYXJzZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb21tYW5kLXBhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDbkQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFHeEQsTUFBTSxPQUFPLGFBQWE7SUFDakIsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFlO1FBQ3hDLElBQUksQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO1lBQ3RDLE9BQU87UUFDVCxDQUFDO1FBQ0QsSUFBSSxPQUFPLEdBQXVCLGNBQWMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUM1RCxRQUFRLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ25CLEtBQUssR0FBRztnQkFDTixPQUFPLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDM0IsTUFBTTtZQUNSLEtBQUssR0FBRztnQkFDTixPQUFPLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDM0IsT0FBTyxHQUFHLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUN0QyxNQUFNO1lBQ1I7Z0JBQ0UsT0FBTyxHQUFHLE9BQU8sT0FBTyxFQUFFLENBQUM7Z0JBQzNCLE1BQU07UUFDVixDQUFDO1FBQ0QsT0FBTyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoQyxDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBCYXNlQ29tbWFuZEhhbmRsZXIgfSBmcm9tICcuL2NvbW1hbmQtYmFzZSc7XG5pbXBvcnQgeyBDb21tYW5kSGFuZGxlciB9IGZyb20gJy4vY29tbWFuZC1oYW5kbGVyJztcbmltcG9ydCB7IEdNQ29tbWFuZEhhbmRsZXIgfSBmcm9tICcuL2dtLWNvbW1hbmQtaGFuZGxlcic7XG5cblxuZXhwb3J0IGNsYXNzIENvbW1hbmRQYXJzZXIge1xuICBwdWJsaWMgc3RhdGljIHBhcnNlQ29tbWFuZChjb21tYW5kOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAoIWNvbW1hbmQgfHwgY29tbWFuZC50cmltKCkgPT09ICcnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxldCBoYW5kbGVyOiBCYXNlQ29tbWFuZEhhbmRsZXIgPSBDb21tYW5kSGFuZGxlci5pbnN0YW5jZSgpO1xuICAgIHN3aXRjaCAoY29tbWFuZFswXSkge1xuICAgICAgY2FzZSAnLyc6XG4gICAgICAgIGNvbW1hbmQgPSBjb21tYW5kLnNsaWNlKDEpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyMnOlxuICAgICAgICBjb21tYW5kID0gY29tbWFuZC5zbGljZSgxKTtcbiAgICAgICAgaGFuZGxlciA9IEdNQ29tbWFuZEhhbmRsZXIuaW5zdGFuY2UoKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBjb21tYW5kID0gYHNheSAke2NvbW1hbmR9YDtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGhhbmRsZXIucGFyc2VDb21tYW5kKGNvbW1hbmQpO1xuICB9XG59XG4iXX0=