import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import Player from '@game/Player/player';
import { Box } from '@mui/material';
import { UiWindowComponent } from '../../../common/ui-window';
import { useStoneImage } from '../../../hooks/use-image';
import { useUIContext } from '../../context';
// Atlas entries for the compass components
export const CompassWindowComponent = () => {
    const state = useUIContext((state) => state.ui.compassWindow);
    const overlay = useStoneImage('A_CompassOverlay');
    const strip = useStoneImage('A_CompassStrip', true);
    const [offset, setOffset] = useState(0);
    const prevRotationRef = useRef(0); // Track previous rotation
    const totalDegreesRef = useRef(0); // Accumulate total degrees for continuity
    useEffect(() => {
        const interval = setInterval(() => {
            try {
                const rotation = Player.instance?.getPlayerRotation()
                    ?.y ?? 0;
                // Convert current and previous rotations to degrees
                const currentDegrees = (rotation * 180) / Math.PI;
                const prevDegrees = (prevRotationRef.current * 180) / Math.PI;
                // Calculate the difference, accounting for wrap-around
                let deltaDegrees = currentDegrees - prevDegrees;
                if (deltaDegrees > 180) {
                    deltaDegrees -= 360; // Adjust for crossing from PI to -PI
                }
                else if (deltaDegrees < -180) {
                    deltaDegrees += 360; // Adjust for crossing from -PI to PI
                }
                // Update total degrees for continuous rotation
                totalDegreesRef.current += deltaDegrees;
                // Update previous rotation
                prevRotationRef.current = rotation;
                // Calculate offset based on total degrees
                const stripWidth = strip.entry.width; // Width of one instance of the strip image
                const offsetPerDegree = stripWidth / 360; // Pixels per degree
                const newOffset = (totalDegreesRef.current % 360) * offsetPerDegree * -1;
                setOffset(newOffset);
            }
            finally {
                // Do nothing
            }
        }, 10); // Update every 50ms for smoother movement (adjust as needed)
        // Cleanup interval on unmount
        return () => clearInterval(interval);
    }, [strip.entry.width]);
    return (_jsx(UiWindowComponent, { state: state, windowName: "compassWindow", children: _jsxs(Box, { sx: {
                position: 'relative',
                width: `${overlay.entry.width}px`,
                height: `${overlay.entry.height}px`,
                overflow: 'hidden',
            }, children: [_jsx(Box, { sx: {
                        position: 'absolute',
                        zIndex: 0,
                        width: `${strip.entry.width * 2}px`,
                        height: `${strip.entry.height}px`,
                        backgroundImage: `url(${strip.image})`,
                        backgroundPosition: `${-offset + strip.entry.width / 2}px 0px`,
                        backgroundRepeat: 'repeat-x',
                    } }), _jsx(Box, { sx: {
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        zIndex: 1,
                        width: `${overlay.entry.width}px`,
                        height: `${overlay.entry.height}px`,
                        backgroundImage: `url(${overlay.image})`,
                        backgroundPosition: `-${overlay.entry.left}px -${overlay.entry.top}px`,
                    } })] }) }));
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGFzcy13aW5kb3cuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb21wYXNzLXdpbmRvdy50c3giXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQWMsRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxNQUFNLE9BQU8sQ0FBQztBQUMzRCxPQUFPLE1BQU0sTUFBTSxxQkFBcUIsQ0FBQztBQUN6QyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3BDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzlELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRTdDLDJDQUEyQztBQUMzQyxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBYSxHQUFHLEVBQUU7SUFDbkQsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzlELE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQ2xELE1BQU0sS0FBSyxHQUFHLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNwRCxNQUFNLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4QyxNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQywwQkFBMEI7SUFDN0QsTUFBTSxlQUFlLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsMENBQTBDO0lBRTdFLFNBQVMsQ0FBQyxHQUFHLEVBQUU7UUFDYixNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFO1lBQ2hDLElBQUksQ0FBQztnQkFDSCxN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QyxLQUFLLElBQUk7d0JBQzlDLE1BQU0sRUFBYyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJO3dCQUMvQyxlQUFlLEVBQUssT0FBTyxPQUFPLENBQUMsS0FBSyxHQUFHO3dCQUMzQyxrQkFBa0IsRUFBRSxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJO3FCQUN2RSxHQUNELElBQ0UsR0FDWSxDQUNyQixDQUFDO0FBQ0osQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFJlYWN0LCB7IHVzZUVmZmVjdCwgdXNlUmVmLCB1c2VTdGF0ZSB9IGZyb20gJ3JlYWN0JztcbmltcG9ydCBQbGF5ZXIgZnJvbSAnQGdhbWUvUGxheWVyL3BsYXllcic7XG5pbXBvcnQgeyBCb3ggfSBmcm9tICdAbXVpL21hdGVyaWFsJztcbmltcG9ydCB7IFVpV2luZG93Q29tcG9uZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3VpLXdpbmRvdyc7XG5pbXBvcnQgeyB1c2VTdG9uZUltYWdlIH0gZnJvbSAnLi4vLi4vLi4vaG9va3MvdXNlLWltYWdlJztcbmltcG9ydCB7IHVzZVVJQ29udGV4dCB9IGZyb20gJy4uLy4uL2NvbnRleHQnO1xuXG4vLyBBdGxhcyBlbnRyaWVzIGZvciB0aGUgY29tcGFzcyBjb21wb25lbnRzXG5leHBvcnQgY29uc3QgQ29tcGFzc1dpbmRvd0NvbXBvbmVudDogUmVhY3QuRkMgPSAoKSA9PiB7XG4gIGNvbnN0IHN0YXRlID0gdXNlVUlDb250ZXh0KChzdGF0ZSkgPT4gc3RhdGUudWkuY29tcGFzc1dpbmRvdyk7XG4gIGNvbnN0IG92ZXJsYXkgPSB1c2VTdG9uZUltYWdlKCdBX0NvbXBhc3NPdmVybGF5Jyk7XG4gIGNvbnN0IHN0cmlwID0gdXNlU3RvbmVJbWFnZSgnQV9Db21wYXNzU3RyaXAnLCB0cnVlKTtcbiAgY29uc3QgW29mZnNldCwgc2V0T2Zmc2V0XSA9IHVzZVN0YXRlKDApO1xuICBjb25zdCBwcmV2Um90YXRpb25SZWYgPSB1c2VSZWYoMCk7IC8vIFRyYWNrIHByZXZpb3VzIHJvdGF0aW9uXG4gIGNvbnN0IHRvdGFsRGVncmVlc1JlZiA9IHVzZVJlZigwKTsgLy8gQWNjdW11bGF0ZSB0b3RhbCBkZWdyZWVzIGZvciBjb250aW51aXR5XG5cbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJvdGF0aW9uID1cbiAgICAgIFBsYXllci5pbnN0YW5jZT8uZ2V0UGxheWVyUm90YXRpb24oKVxuICAgICAgICA/LnkgPz8gMDtcblxuICAgICAgICAvLyBDb252ZXJ0IGN1cnJlbnQgYW5kIHByZXZpb3VzIHJvdGF0aW9ucyB0byBkZWdyZWVzXG4gICAgICAgIGNvbnN0IGN1cnJlbnREZWdyZWVzID0gKHJvdGF0aW9uICogMTgwKSAvIE1hdGguUEk7XG4gICAgICAgIGNvbnN0IHByZXZEZWdyZWVzID0gKHByZXZSb3RhdGlvblJlZi5jdXJyZW50ICogMTgwKSAvIE1hdGguUEk7XG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBkaWZmZXJlbmNlLCBhY2NvdW50aW5nIGZvciB3cmFwLWFyb3VuZFxuICAgICAgICBsZXQgZGVsdGFEZWdyZWVzID0gY3VycmVudERlZ3JlZXMgLSBwcmV2RGVncmVlcztcbiAgICAgICAgaWYgKGRlbHRhRGVncmVlcyA+IDE4MCkge1xuICAgICAgICAgIGRlbHRhRGVncmVlcyAtPSAzNjA7IC8vIEFkanVzdCBmb3IgY3Jvc3NpbmcgZnJvbSBQSSB0byAtUElcbiAgICAgICAgfSBlbHNlIGlmIChkZWx0YURlZ3JlZXMgPCAtMTgwKSB7XG4gICAgICAgICAgZGVsdGFEZWdyZWVzICs9IDM2MDsgLy8gQWRqdXN0IGZvciBjcm9zc2luZyBmcm9tIC1QSSB0byBQSVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVXBkYXRlIHRvdGFsIGRlZ3JlZXMgZm9yIGNvbnRpbnVvdXMgcm90YXRpb25cbiAgICAgICAgdG90YWxEZWdyZWVzUmVmLmN1cnJlbnQgKz0gZGVsdGFEZWdyZWVzO1xuXG4gICAgICAgIC8vIFVwZGF0ZSBwcmV2aW91cyByb3RhdGlvblxuICAgICAgICBwcmV2Um90YXRpb25SZWYuY3VycmVudCA9IHJvdGF0aW9uO1xuXG4gICAgICAgIC8vIENhbGN1bGF0ZSBvZmZzZXQgYmFzZWQgb24gdG90YWwgZGVncmVlc1xuICAgICAgICBjb25zdCBzdHJpcFdpZHRoID0gc3RyaXAuZW50cnkud2lkdGg7IC8vIFdpZHRoIG9mIG9uZSBpbnN0YW5jZSBvZiB0aGUgc3RyaXAgaW1hZ2VcbiAgICAgICAgY29uc3Qgb2Zmc2V0UGVyRGVncmVlID0gc3RyaXBXaWR0aCAvIDM2MDsgLy8gUGl4ZWxzIHBlciBkZWdyZWVcbiAgICAgICAgY29uc3QgbmV3T2Zmc2V0ID0gKHRvdGFsRGVncmVlc1JlZi5jdXJyZW50ICUgMzYwKSAqIG9mZnNldFBlckRlZ3JlZSAqIC0xO1xuXG4gICAgICAgIHNldE9mZnNldChuZXdPZmZzZXQpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgLy8gRG8gbm90aGluZ1xuICAgICAgfVxuICAgIH0sIDEwKTsgLy8gVXBkYXRlIGV2ZXJ5IDUwbXMgZm9yIHNtb290aGVyIG1vdmVtZW50IChhZGp1c3QgYXMgbmVlZGVkKVxuXG4gICAgLy8gQ2xlYW51cCBpbnRlcnZhbCBvbiB1bm1vdW50XG4gICAgcmV0dXJuICgpID0+IGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICB9LCBbc3RyaXAuZW50cnkud2lkdGhdKTtcbiAgcmV0dXJuIChcbiAgICA8VWlXaW5kb3dDb21wb25lbnRcbiAgICAgIHN0YXRlPXtzdGF0ZX1cbiAgICAgIHdpbmRvd05hbWU9XCJjb21wYXNzV2luZG93XCJcbiAgICA+XG4gICAgICA8Qm94XG4gICAgICAgIHN4PXt7XG4gICAgICAgICAgcG9zaXRpb246ICdyZWxhdGl2ZScsXG4gICAgICAgICAgd2lkdGggICA6IGAke292ZXJsYXkuZW50cnkud2lkdGh9cHhgLFxuICAgICAgICAgIGhlaWdodCAgOiBgJHtvdmVybGF5LmVudHJ5LmhlaWdodH1weGAsXG4gICAgICAgICAgb3ZlcmZsb3c6ICdoaWRkZW4nLFxuICAgICAgICB9fVxuICAgICAgPlxuICAgICAgICB7LyogQ29tcGFzcyBTdHJpcCAodW5kZXJuZWF0aCkgKi99XG4gICAgICAgIDxCb3hcbiAgICAgICAgICBzeD17e1xuICAgICAgICAgICAgcG9zaXRpb24gICAgICAgICAgOiAnYWJzb2x1dGUnLFxuICAgICAgICAgICAgekluZGV4ICAgICAgICAgICAgOiAwLFxuICAgICAgICAgICAgd2lkdGggICAgICAgICAgICAgOiBgJHtzdHJpcC5lbnRyeS53aWR0aCAqIDJ9cHhgLFxuICAgICAgICAgICAgaGVpZ2h0ICAgICAgICAgICAgOiBgJHtzdHJpcC5lbnRyeS5oZWlnaHR9cHhgLFxuICAgICAgICAgICAgYmFja2dyb3VuZEltYWdlICAgOiBgdXJsKCR7c3RyaXAuaW1hZ2V9KWAsXG4gICAgICAgICAgICBiYWNrZ3JvdW5kUG9zaXRpb246IGAkey1vZmZzZXQgKyBzdHJpcC5lbnRyeS53aWR0aCAvIDJ9cHggMHB4YCxcbiAgICAgICAgICAgIGJhY2tncm91bmRSZXBlYXQgIDogJ3JlcGVhdC14JyxcbiAgICAgICAgICB9fVxuICAgICAgICAvPlxuICAgICAgICB7LyogQ29tcGFzcyBPdmVybGF5IChvbiB0b3ApICovfVxuICAgICAgICA8Qm94XG4gICAgICAgICAgc3g9e3tcbiAgICAgICAgICAgIHBvc2l0aW9uICAgICAgICAgIDogJ2Fic29sdXRlJyxcbiAgICAgICAgICAgIGxlZnQgICAgICAgICAgICAgIDogMCxcbiAgICAgICAgICAgIHRvcCAgICAgICAgICAgICAgIDogMCxcbiAgICAgICAgICAgIHpJbmRleCAgICAgICAgICAgIDogMSxcbiAgICAgICAgICAgIHdpZHRoICAgICAgICAgICAgIDogYCR7b3ZlcmxheS5lbnRyeS53aWR0aH1weGAsXG4gICAgICAgICAgICBoZWlnaHQgICAgICAgICAgICA6IGAke292ZXJsYXkuZW50cnkuaGVpZ2h0fXB4YCxcbiAgICAgICAgICAgIGJhY2tncm91bmRJbWFnZSAgIDogYHVybCgke292ZXJsYXkuaW1hZ2V9KWAsXG4gICAgICAgICAgICBiYWNrZ3JvdW5kUG9zaXRpb246IGAtJHtvdmVybGF5LmVudHJ5LmxlZnR9cHggLSR7b3ZlcmxheS5lbnRyeS50b3B9cHhgLFxuICAgICAgICAgIH19XG4gICAgICAgIC8+XG4gICAgICA8L0JveD5cbiAgICA8L1VpV2luZG93Q29tcG9uZW50PlxuICApO1xufTtcbiJdfQ==