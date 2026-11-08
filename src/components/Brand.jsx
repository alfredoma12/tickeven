import logo from "../../style/tickevenlogo.jpeg";

export default function Brand({ href = "/", className = "brand" }) {
  return (
    <a className={className} href={href} aria-label="TickEven.cl, inicio">
      <img className="brand__logo" src={logo} alt="" />
    </a>
  );
}
