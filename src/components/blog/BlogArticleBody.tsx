import type { BlogBlock } from "@/lib/blog/types";

type BlogArticleBodyProps = {
  blocks: BlogBlock[];
};

export function BlogArticleBody({ blocks }: BlogArticleBodyProps) {
  return (
    <div className="blog-prose">
      {blocks.map((block, index) => {
        if (block.type === "p") return <p key={index}>{block.text}</p>;
        if (block.type === "h2") return <h2 key={index}>{block.text}</h2>;
        if (block.type === "h3") return <h3 key={index}>{block.text}</h3>;
        if (block.type === "ul") {
          return (
            <ul key={index}>
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={index}>
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          );
        }
        return null;
      })}
    </div>
  );
}
