import { useRef, useEffect } from "react";
import "./App.css";

function WebCanvas() {
	// select canvas element
	const webGpuCanvas = useRef(null);

	// useEffect runs after render
	useEffect(() => {
		if (webGpuCanvas != null) {
			initWebGPU(webGpuCanvas.current);
		}
	}, []);

	/**
	 * init the webGpu test
	 */
	const initWebGPU = async (canvas) => {
		if (!navigator.gpu) {
			throw new Error("WebGPU not supported on this browser.");
		}

		// get adapter
		const adapter = await navigator.gpu.requestAdapter();

		// adapter can be null if GPU does not support WebGPU features
		if (!adapter) {
			throw new Error("No appropriate GPUAdapter found.");
		}

		// get device
		const device = await adapter.requestDevice();

		// canvas configuration
		const context = canvas.getContext("webgpu"); // same call for webGL ("2d")/("webgl")
		const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
		context.configure({
			device: device,
			format: canvasFormat, // texture format that the context should use.
		});

		/**
		 * draw geometry
		 */
		// vertices Array [(x,y),(x,y)....] for corners of square
		const vertices = new Float32Array([
			// first triangle
			-0.8, -0.8, 0.8, -0.8, 0.8, 0.8,
			// second triangle
			-0.8, -0.8, -0.8, 0.8, 0.8, 0.8,
		]);

		// size of vertices Array (4 Byte per float(32Bit) = 48 Byte)
		console.log(vertices.byteLength);

		// buffer to hold vertices
		const vertexBuffer = device.createBuffer({
			label: "Cell vertices", // webGPU objects can have labels
			size: vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, // buffer used for vertex data and copy data into it
		});

		// copy the vertex data into the buffer
		device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);

		// structure of the vertex data for the GPU
		const vertexBufferLayout = {
			arrayStride: 8, // GPU needs to skip 8 bytes for new vertex (1 Vertex = 2 * 4 Byte Float)
			attributes: [
				{
					format: "float32x2", // our vertex format = 2 * 32 Bit
					offset: 0,
					shaderLocation: 0, // Position, see vertex shader
				},
			],
		};

		// shader config with WebGPU Shading Language (WGSL)
		const cellShaderModule = device.createShaderModule({
			label: "Cell shader",
			code: `
            // vertex shader gets called once for every vertex, return 4d vector, mostly parallel called
            @vertex
            fn vertexMain(@location(0) pos: vec2f) -> @builtin(position) vec4f{ 
				return vec4f(pos, 0, 1); // (X, Y, Z, W) 2d vector in 4d return vector
            }
            
			// fragment shader gets called once for every pixel drawn
			@fragment
			fn fragmentMain() -> @location(0) vec4f {
				return vec4f(0.2, 0.7, 0.8, 1); // (Red, Green, Blue, Alpha)
			}

            `,
		});

		// create render pipeline
		const cellPipeline = device.createRenderPipeline({
			label: "Cell pipeline",
			layout: "auto",
			vertex: {
				module: cellShaderModule,
				entryPoint: "vertexMain",
				buffers: [vertexBufferLayout],
			},
			fragment: {
				module: cellShaderModule,
				entryPoint: "fragmentMain",
				targets: [
					{
						format: canvasFormat,
					},
				],
			},
		});

		/**
		 * render
		 */
		// records GPU commands
		const encoder = device.createCommandEncoder();

		// begin render pass
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: context.getCurrentTexture().createView(), //needs GPUTextureView instead of GPUTexture -> .createView()
					loadOp: "clear", // when render pass starts -> clear texture
					clearValue: { r: 0.3, g: 0.2, b: 0.5, a: 1 }, // Color
					storeOp: "store", // save/store any drawing from render pass into the texture
				},
			],
		});

		// render pipeline
		pass.setPipeline(cellPipeline);
		// our vertices
		pass.setVertexBuffer(0, vertexBuffer);
		// number of vertices to render (6 vertices)
		pass.draw(vertices.length / 2);

		// end render pass || still recording GPU calls for later, nothing done now
		pass.end();

		// create GPUCommandBuffer
		//const commandBuffer = encoder.finish();

		// sumbit in queue to GPU
		//device.queue.submit([commandBuffer]);

		// Finish the command buffer and immediately submit it. -> both together
		device.queue.submit([encoder.finish()]);
	};

	return (
		<>
			<canvas ref={webGpuCanvas} width={512} height={512}></canvas>
		</>
	);
}

export default WebCanvas;
