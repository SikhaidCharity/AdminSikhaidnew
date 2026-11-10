import { boldParts, parseContent } from '@/lib/blog-format';

const Text = ({ text }) =>
  boldParts(text).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>));

// Only site images and web links, so a pasted "javascript:" link can never run.
const safeSrc = (src) => (/^(https?:\/\/|\/)/i.test(src) ? src : '');

export default function BlogContent({ content }) {
  return parseContent(content).map((piece, i) => {
    if (piece.type === 'h2') return <h2 key={i}><Text text={piece.text} /></h2>;
    if (piece.type === 'h3') return <h3 key={i}><Text text={piece.text} /></h3>;
    if (piece.type === 'list') {
      return <ul key={i}>{piece.items.map((item, j) => <li key={j}><Text text={item} /></li>)}</ul>;
    }
    if (piece.type === 'img') {
      const src = safeSrc(piece.src);
      if (!src) return null;
      return (
        <figure key={i}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={piece.text} loading="lazy" />
          {piece.text && <figcaption>{piece.text}</figcaption>}
        </figure>
      );
    }
    return <p key={i}><Text text={piece.text} /></p>;
  });
}
