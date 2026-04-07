interface IDebugIconProps {
  color?: string;
  size?: number | string;
}

export const DebugIcon = ({ color = "#fff", size = 20 }: IDebugIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Bug body */}
    <ellipse cx="10" cy="11" rx="4.5" ry="5.5" stroke={color} strokeWidth="1.5" />
    {/* Head */}
    <path d="M7.5 6.5C7.5 5.12 8.62 4 10 4s2.5 1.12 2.5 2.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    {/* Antennae */}
    <path d="M8.5 4.5L7 3M11.5 4.5L13 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    {/* Left legs */}
    <path d="M5.5 9H3M5.5 11H3M5.5 13H3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    {/* Right legs */}
    <path d="M14.5 9H17M14.5 11H17M14.5 13H17" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    {/* Center line */}
    <path d="M10 6.5V16.5" stroke={color} strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 2" />
  </svg>
);
