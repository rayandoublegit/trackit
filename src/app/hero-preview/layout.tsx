export default function HeroPreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`body { padding-top: 0 !important; }`}</style>
      {children}
    </>
  );
}
