import "./App.css";

function WebCanvas() {
	return (
		<>
			<canvas width={512} height={512}></canvas>
		</>
	);
}

export default WebCanvas;

const webGpuCanvas = document.querySelector("canvas");
const adapter = await navigator.gpu.requestAdapter(); //adapter can be null if GPU does not support WebGPU features
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
