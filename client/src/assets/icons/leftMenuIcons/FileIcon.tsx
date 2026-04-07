interface Props {
  color?: string;
}

export const FileIcon = ({ color = "#000000" }: Props) => (
  <svg width="24px" height="24px" viewBox="0 0 24 24" fill="none">
    <path
      d="M14 6H9C7.89543 6 7 6.89543 7 8V20C7 21.1046 7.89543 22 9 22H18C19.1046 22 20 21.1046 20 20V12M14 6L20 12M14 6V11C14 11.5523 14.4477 12 15 12H20M3 16V4C3 2.89543 3.89543 2 5 2H15"
      stroke={color}
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
