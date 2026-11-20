type Props = {
  /** The size of the icon, 24px is default to match standard icons */
  size?: number;
  /** The color of the icon, defaults to the current text color */
  fill?: string;
};

/**
 * Generic icon for the Azure DevOps integration, a board with a check mark.
 *
 * @param props.size the size of the icon.
 * @param props.fill the color of the icon.
 * @returns the icon element.
 */
export default function Icon({ size = 24, fill = "currentColor" }: Props) {
  return (
    <svg
      fill={fill}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      version="1.1"
      aria-hidden="true"
    >
      <path
        d="M6 4C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V6C20 4.89543 19.1046 4 18 4H6ZM6 6H18V18H6V6Z"
        fillRule="evenodd"
        clipRule="evenodd"
      />
      <path d="M10.5 14.0858L8.70711 12.2929L7.29289 13.7071L10.5 16.9142L16.7071 10.7071L15.2929 9.29289L10.5 14.0858Z" />
      <path d="M8 8H16V9.5H8V8Z" />
    </svg>
  );
}
