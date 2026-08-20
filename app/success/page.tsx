export default function SuccessPage() {
  return (
    <main className="stage" style={{ padding: 24 }}>
      <p className="mark">Pixelrest</p>
      <p>Payment received. Your squares show on the board after Stripe confirms.</p>
      <p>
        <a href="/" style={{ color: "#eaeaea" }}>
          Back to the board
        </a>
      </p>
    </main>
  );
}
