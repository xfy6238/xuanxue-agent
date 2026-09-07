export default function ThinkingDots({ text = "" }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {text && <span>{text}</span>}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#6f6350]"
          style={{ animationDelay: `${i * 180}ms` }}
        />
      ))}
    </span>
  );
}
