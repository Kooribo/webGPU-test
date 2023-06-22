//select canvas element
const webGpuCanvas = document.querySelector("canvas");
if(webGpuCanvas != null){
	initWebGPU();
}

async function initWebGPU(){
	if (!navigator.gpu) {
		throw new Error("WebGPU not supported on this browser.");
	}
	
	const adapter = await navigator.gpu.requestAdapter(); 
	//adapter can be null if GPU does not support WebGPU features
	if (!adapter) {
		throw new Error("No appropriate GPUAdapter found.");
	}
	const device = await adapter.requestDevice();
	
	// Canvas configuration
	const context = webGpuCanvas.getContext("webgpu");
	const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		device: device,
		format: canvasFormat,
	});
	
}
