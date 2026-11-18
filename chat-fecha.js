const formato = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Monterrey"
});

export function fechaMensaje(fecha = Date.now()) {
  return { fecha, fechaLegible: formato.format(fecha) };
}
