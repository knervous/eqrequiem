import { SxProps } from "@mui/material";
import React from "react";
type Props = {
    name: string;
    crop?: boolean;
    children?: React.ReactNode;
    sx?: SxProps;
    sak?: boolean;
    onClick?: () => void;
};
export declare const UiImageComponent: React.FC<Props>;
export {};
