import icon from '../assets/lectureleaf-icon.png';

interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  light?: boolean;
}

export default function Logo({ size = 'md', light = false }: LogoProps) {
  const iconSizes = { xs: 20, sm: 26, md: 34, lg: 52 };
  const textSizes = { xs: 'text-sm', sm: 'text-base', md: 'text-xl', lg: 'text-3xl' };
  const px = iconSizes[size];

  return (
    <div className="flex items-center gap-2.5">
      <img
        src={icon}
        alt="LectureLeaf"
        width={px}
        height={px}
        style={{ objectFit: 'contain' }}
      />
      <span
        className={`${textSizes[size]} tracking-tight`}
        style={{
          fontFamily: 'DM Sans, sans-serif',
          fontWeight: 700,
          color: light ? '#FFFDF9' : '#151515',
          letterSpacing: '-0.02em',
        }}
      >
        LectureLeaf
      </span>
    </div>
  );
}
