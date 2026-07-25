import type { ActionButtonsConfig } from '@game/Config/types';
import { FullActionData } from './constants';
interface CommonButtonProps {
    background?: string;
    foreGround?: string;
    size?: number | string;
    text?: string;
    scale?: number;
    actionData?: FullActionData;
    useDefaultSize?: boolean;
    hotButton?: boolean;
}
interface HotButtonProps extends CommonButtonProps {
    index: number;
    actionButtonConfig: ActionButtonsConfig | null;
}
interface ActionButtonProps extends CommonButtonProps {
    action: (_: any) => void;
    playerAction?: boolean;
    buttonName?: string;
}
export declare const ActionButton: React.FC<ActionButtonProps>;
export declare const ActionHotButton: React.FC<HotButtonProps>;
export {};
