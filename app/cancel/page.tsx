export default function CancelPage() {
  return (
    <main className="stage" style={{ padding: 24 }}>
      <p className="mark">Pixelrest</p>
      <p>Checkout cancelled. No squares were claimed.</p>
      <p>
        <a href="/" style={{ color: "#eaeaea" }}>
          Back to the board
        </a>
      </p>
    </main>
  );
}
