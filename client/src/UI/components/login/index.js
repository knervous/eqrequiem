import { jsx as _jsx } from "react/jsx-runtime";
import { LoginWindowComponent } from "./login-window";
import { Box } from "@mui/material";
import { getSplashImage } from "../../common/splash";
export const LoginUIComponent = () => {
    return (_jsx(Box, { sx: {
            background: `
          radial-gradient(circle at center, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0.9) 100%),
          url(${getSplashImage()}) center / auto 100% no-repeat
        `, // Vignette overlay + background image
            backgroundColor: "#1a1a1a", // Very dark gray base color
            width: "100vw",
            height: "100vh",
            display: "flex", // Flexbox layout
            justifyContent: "center", // Center horizontally
            alignItems: "center", // Center vertically
        }, children: _jsx(LoginWindowComponent, {}) }));
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50c3giXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUNBLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDcEMsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXJELE1BQU0sQ0FBQyxNQUFNLGdCQUFnQixHQUFhLEdBQUcsRUFBRTtJQUM3QyxPQUFPLENBQ0wsS0FBQyxHQUFHLElBQ0YsRUFBRSxFQUFFO1lBQ0YsVUFBVSxFQUFFOztnQkFFSixjQUFjLEVBQUU7U0FDdkIsRUFBRSxzQ0FBc0M7WUFDekMsZUFBZSxFQUFFLFNBQVMsRUFBRSw0QkFBNEI7WUFDeEQsS0FBSyxFQUFFLE9BQU87WUFDZCxNQUFNLEVBQUUsT0FBTztZQUNmLE9BQU8sRUFBRSxNQUFNLEVBQUUsaUJBQWlCO1lBQ2xDLGNBQWMsRUFBRSxRQUFRLEVBQUUsc0JBQXNCO1lBQ2hELFVBQVUsRUFBRSxRQUFRLEVBQUUsb0JBQW9CO1NBQzNDLFlBRUQsS0FBQyxvQkFBb0IsS0FBRyxHQUNwQixDQUNQLENBQUM7QUFDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUmVhY3QgZnJvbSBcInJlYWN0XCI7XG5pbXBvcnQgeyBMb2dpbldpbmRvd0NvbXBvbmVudCB9IGZyb20gXCIuL2xvZ2luLXdpbmRvd1wiO1xuaW1wb3J0IHsgQm94IH0gZnJvbSBcIkBtdWkvbWF0ZXJpYWxcIjtcbmltcG9ydCB7IGdldFNwbGFzaEltYWdlIH0gZnJvbSBcIi4uLy4uL2NvbW1vbi9zcGxhc2hcIjtcblxuZXhwb3J0IGNvbnN0IExvZ2luVUlDb21wb25lbnQ6IFJlYWN0LkZDID0gKCkgPT4ge1xuICByZXR1cm4gKFxuICAgIDxCb3hcbiAgICAgIHN4PXt7XG4gICAgICAgIGJhY2tncm91bmQ6IGBcbiAgICAgICAgICByYWRpYWwtZ3JhZGllbnQoY2lyY2xlIGF0IGNlbnRlciwgcmdiYSgwLCAwLCAwLCAwKSAzMCUsIHJnYmEoMCwgMCwgMCwgMC45KSAxMDAlKSxcbiAgICAgICAgICB1cmwoJHtnZXRTcGxhc2hJbWFnZSgpfSkgY2VudGVyIC8gYXV0byAxMDAlIG5vLXJlcGVhdFxuICAgICAgICBgLCAvLyBWaWduZXR0ZSBvdmVybGF5ICsgYmFja2dyb3VuZCBpbWFnZVxuICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6IFwiIzFhMWExYVwiLCAvLyBWZXJ5IGRhcmsgZ3JheSBiYXNlIGNvbG9yXG4gICAgICAgIHdpZHRoOiBcIjEwMHZ3XCIsXG4gICAgICAgIGhlaWdodDogXCIxMDB2aFwiLFxuICAgICAgICBkaXNwbGF5OiBcImZsZXhcIiwgLy8gRmxleGJveCBsYXlvdXRcbiAgICAgICAganVzdGlmeUNvbnRlbnQ6IFwiY2VudGVyXCIsIC8vIENlbnRlciBob3Jpem9udGFsbHlcbiAgICAgICAgYWxpZ25JdGVtczogXCJjZW50ZXJcIiwgLy8gQ2VudGVyIHZlcnRpY2FsbHlcbiAgICAgIH19XG4gICAgPlxuICAgICAgPExvZ2luV2luZG93Q29tcG9uZW50IC8+XG4gICAgPC9Cb3g+XG4gICk7XG59OyJdfQ==