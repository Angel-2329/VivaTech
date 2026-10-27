import { useSesion } from '../context/SesionContext.jsx'

function EstadoSesion() {
  const { cargando, errorSesion, refrescarPerfil } = useSesion()

  return (
    <main className="vt-main">
      <div className="vt-container vt-stack vt-stack-lg">
        {cargando ? (
          <p role="status">Cargando…</p>
        ) : (
          <>
            <h1 className="vt-headline-md">
              No pudimos recuperar tu sesión
            </h1>

            <p role="alert">{errorSesion}</p>

            <button
              type="button"
              className="vt-btn vt-btn-primary"
              onClick={() => {
                void refrescarPerfil()
              }}
            >
              Reintentar
            </button>
          </>
        )}
      </div>
    </main>
  )
}

export default EstadoSesion