const service=require('../services/facturacionService');
const dianTransmission=require('../services/dianTransmissionService');
const permisoService=require('../services/permisoService');
const { ErrorTransmisionDian }=dianTransmission;
function manejarError(err){
  if(err instanceof permisoService.PermisoError)return {ok:false,error:err.message};
  if(err instanceof service.ErrorNegocio)return {ok:false,error:err.message};
  if(err instanceof ErrorTransmisionDian)return {ok:false,error:err.message};
  console.error('[facturacionController] error interno:',err?.message);
  return {ok:false,error:'No fue posible completar la operación. Revise los datos e intente nuevamente.'};
}
function envolver(fn){try{return {ok:true,data:fn()};}catch(err){return manejarError(err);}}
async function envolverAsync(fn){try{return {ok:true,data:await fn()};}catch(err){return manejarError(err);}}
module.exports={
  clientes:(u,f)=>envolver(()=>service.listarClientes(u,f)),guardarCliente:(u,d)=>envolver(()=>service.guardarCliente(u,d)),
  catalogos:(u,f)=>envolver(()=>service.obtenerCatalogos(u,f)),configuracion:(u,f)=>envolver(()=>service.obtenerConfiguracion(u,f)),
  guardarConfiguracion:(u,d)=>envolver(()=>service.guardarConfiguracion(u,d)),
  crearFactura:(u,d)=>envolver(()=>service.crearFactura(u,d)),crearNotaCredito:(u,d)=>envolver(()=>service.crearNotaCredito(u,d)),
  crearNotaDebito:(u,d)=>envolver(()=>service.crearNotaDebito(u,d)),pago:(u,id,d)=>envolver(()=>service.registrarPago(u,id,d)),
  listar:(u,f)=>envolver(()=>service.listar(u,f)),cartera:(u,f)=>envolver(()=>service.cartera(u,f)),reportes:(u,f)=>envolver(()=>service.reportes(u,f)),
  colaDian:(u,f)=>envolver(()=>service.obtenerColaDian(u,f)),
  prepararDocumentoDian:(u,id)=>envolverAsync(()=>service.prepararDocumentoDian(u,id)),
  transmitirDocumentoDian:(u,id)=>envolverAsync(()=>dianTransmission.transmitirFacturaHabilitacion(u,id)),
  consultarEstadoDian:(u,id)=>envolverAsync(()=>dianTransmission.consultarEstadoZip(u,id))
};
