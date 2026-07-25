import { Skills, ActiveCombatSkills } from '@game/Constants/skills';
export class PlayerCombat {
    player;
    constructor(player) {
        this.player = player;
    }
    doCombatAction(actionData) {
        switch (actionData.data) {
            case ActiveCombatSkills[Skills.Kick]:
                break;
            case ActiveCombatSkills[Skills.ApplyPoison]:
                break;
            case ActiveCombatSkills[Skills.Backstab]:
                break;
            case ActiveCombatSkills[Skills.Bash]:
                break;
            case ActiveCombatSkills[Skills.Disarm]:
                break;
            case ActiveCombatSkills[Skills.DragonPunchTailRake]:
                break;
            case ActiveCombatSkills[Skills.DualWield]:
                break;
            case ActiveCombatSkills[Skills.EagleStrike]:
                break;
            case ActiveCombatSkills[Skills.Evocation]:
                break;
            case ActiveCombatSkills[Skills.FlyingKick]:
                break;
            case ActiveCombatSkills[Skills.Kick]:
                break;
            case ActiveCombatSkills[Skills.RoundKick]:
                break;
            default: break;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxheWVyLWNvbWJhdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInBsYXllci1jb21iYXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLE1BQU0sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBS3BFLE1BQU0sT0FBTyxZQUFZO0lBQ0gsTUFBTTtJQUExQixZQUFvQixNQUFjO3NCQUFkLE1BQU07SUFDMUIsQ0FBQztJQUVNLGNBQWMsQ0FBQyxVQUFvQztRQUN4RCxRQUFRLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN4QixLQUFLLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2xDLE1BQU07WUFDUixLQUFLLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUM7Z0JBQ3pDLE1BQU07WUFDUixLQUFLLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7Z0JBQ3RDLE1BQU07WUFDUixLQUFLLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2xDLE1BQU07WUFDUixLQUFLLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ3BDLE1BQU07WUFDUixLQUFLLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQztnQkFDakQsTUFBTTtZQUNSLEtBQUssa0JBQWtCLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQztnQkFDdkMsTUFBTTtZQUNSLEtBQUssa0JBQWtCLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQztnQkFDekMsTUFBTTtZQUNSLEtBQUssa0JBQWtCLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQztnQkFDdkMsTUFBTTtZQUNSLEtBQUssa0JBQWtCLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQztnQkFDeEMsTUFBTTtZQUNSLEtBQUssa0JBQWtCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDbEMsTUFBTTtZQUNSLEtBQUssa0JBQWtCLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQztnQkFDdkMsTUFBTTtZQUNSLFNBQVMsTUFBTTtRQUNqQixDQUFDO0lBQ0gsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU2tpbGxzLCBBY3RpdmVDb21iYXRTa2lsbHMgfSBmcm9tICdAZ2FtZS9Db25zdGFudHMvc2tpbGxzJztcbmltcG9ydCB0eXBlIHsgQWN0aW9uQnV0dG9uRGF0YSB9IGZyb20gJ0B1aS9jb21wb25lbnRzL2dhbWUvYWN0aW9uLWJ1dHRvbi9jb25zdGFudHMnO1xuaW1wb3J0IHR5cGUgUGxheWVyIGZyb20gJy4vcGxheWVyJztcblxuXG5leHBvcnQgY2xhc3MgUGxheWVyQ29tYmF0IHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBwbGF5ZXI6IFBsYXllcikge1xuICB9XG5cbiAgcHVibGljIGRvQ29tYmF0QWN0aW9uKGFjdGlvbkRhdGE6IEFjdGlvbkJ1dHRvbkRhdGE8U2tpbGxzPikge1xuICAgIHN3aXRjaCAoYWN0aW9uRGF0YS5kYXRhKSB7XG4gICAgICBjYXNlIEFjdGl2ZUNvbWJhdFNraWxsc1tTa2lsbHMuS2lja106XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBBY3RpdmVDb21iYXRTa2lsbHNbU2tpbGxzLkFwcGx5UG9pc29uXTpcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIEFjdGl2ZUNvbWJhdFNraWxsc1tTa2lsbHMuQmFja3N0YWJdOlxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgQWN0aXZlQ29tYmF0U2tpbGxzW1NraWxscy5CYXNoXTpcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIEFjdGl2ZUNvbWJhdFNraWxsc1tTa2lsbHMuRGlzYXJtXTpcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIEFjdGl2ZUNvbWJhdFNraWxsc1tTa2lsbHMuRHJhZ29uUHVuY2hUYWlsUmFrZV06XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBBY3RpdmVDb21iYXRTa2lsbHNbU2tpbGxzLkR1YWxXaWVsZF06XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBBY3RpdmVDb21iYXRTa2lsbHNbU2tpbGxzLkVhZ2xlU3RyaWtlXTpcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIEFjdGl2ZUNvbWJhdFNraWxsc1tTa2lsbHMuRXZvY2F0aW9uXTpcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIEFjdGl2ZUNvbWJhdFNraWxsc1tTa2lsbHMuRmx5aW5nS2lja106XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBBY3RpdmVDb21iYXRTa2lsbHNbU2tpbGxzLktpY2tdOlxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgQWN0aXZlQ29tYmF0U2tpbGxzW1NraWxscy5Sb3VuZEtpY2tdOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6IGJyZWFrO1xuICAgIH1cbiAgfVxufVxuIl19