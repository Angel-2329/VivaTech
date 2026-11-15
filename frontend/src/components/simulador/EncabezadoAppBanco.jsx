function EncabezadoAppBanco({ titulo }) {
  return (
    <div className="app-banco__encabezado">
      <span className="app-banco__logo" aria-hidden="true">
        BE
      </span>
      <div className="app-banco__titulos">
        <span className="app-banco__marca" aria-hidden="true">
          Banco Ejemplo
        </span>
        <span className="app-banco__titulo">{titulo}</span>
      </div>
      <span className="vt-icon app-banco__perfil" aria-hidden="true">
        account_circle
      </span>
    </div>
  )
}

export default EncabezadoAppBanco
