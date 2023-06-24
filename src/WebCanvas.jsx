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
		const GRID_SIZE = 32; // Grid size (e.g. 32 squares width and height)
		const UPDATE_INTERVAL = 200; // Update every 200ms (5 times/sec)
		let step = 0; // Track how many simulation steps have been run

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

		// buffer to hold vertices
		const vertexBuffer = device.createBuffer({
			label: "Cell vertices", // webGPU objects can have labels
			size: vertices.byteLength, // size of vertices Array (4 Byte per float(32Bit) = 48 Byte)
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

		// uniform buffer that describes the grid.
		const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
		const uniformBuffer = device.createBuffer({
			label: "Grid Uniforms",
			size: uniformArray.byteLength, // size of Float Array (4 Byte per float(32Bit) = 8 Byte)
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

		// storage buffer with the active state of each cell.
		const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
		const cellStateStorage = [
			// two cell states for ping pong pattern
			device.createBuffer({
				label: "Cell State A", //[1,0,0] -> [1,0,0] -> [0,0,1] ... better state
				size: cellStateArray.byteLength,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			}),
			device.createBuffer({
				label: "Cell State B", //[0,0,0] -> [0,1,0] -> [0,1,0] ...
				size: cellStateArray.byteLength,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			}),
		];

		// Mark every third cell of the first grid as active.
		for (let i = 0; i < cellStateArray.length; i += 3) {
			cellStateArray[i] = 1;
		}
		device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

		// Mark every other cell of the second grid as active.
		for (let i = 0; i < cellStateArray.length; i++) {
			cellStateArray[i] = i % 2;
		}
		device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);

		// shader config with WebGPU Shading Language (WGSL)
		const cellShaderModule = device.createShaderModule({
			label: "Cell shader",
			code: `
			@group(0) @binding(0) var<uniform> grid: vec2f; // grid with array: grid_size,grid_size
			@group(0) @binding(1) var<storage> cellState: array<u32>; // cell array: grid_size*grid_size

			// vertex input parameter
			struct VertexInput {
				@location(0) pos: vec2f,
				@builtin(instance_index) instance: u32,
			};
			
			// vertex output parameter
			struct VertexOutput {
				@builtin(position) pos: vec4f, // 4d vertex vector
				@location(0) cell: vec2f // cell information for fragment shader
			};

            // vertex shader gets called once for every vertex, return 4d vector, mostly parallel called
            @vertex
            fn vertexMain(input: VertexInput) -> VertexOutput { 
				
  				let i = f32(input.instance); // Save the instance_index as a float (casting). built in and defined in draw() -> GRID_SIZE * GRID_SIZE
				let cell = vec2f(i % grid.x, floor(i / grid.x)); // compute the cell coordinate from the instance_index
				let state = f32(cellState[input.instance]); // cell state in array can be 0 inactive or 1 active
				let cellOffset = cell / grid * 2; // compute the offset to cell
  				let gridPos = (state*input.pos + 1) / grid - 1 + cellOffset; // calculate grid position with state and offsets

				var output: VertexOutput; // return struct needs to be declared
				output.pos = vec4f(gridPos, 0, 1); // (X, Y, Z, W) 2d vector in 4d return vector
				output.cell = cell; // output now contains cell coordinates
  				return output;
            }
            
			// fragment shader gets called once for every pixel drawn
			@fragment
			fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
				let colorOffset= input.cell / grid;
				return vec4f(colorOffset, 1 - colorOffset.x, 1); // (Red, Green, Blue, Alpha)
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

		// bind uniformBuffer, storageBuffer to shader with bind group
		const bindGroups = [
			device.createBindGroup({
				label: "Cell renderer bind group A",
				layout: cellPipeline.getBindGroupLayout(0), // @group(0) in shader
				entries: [
					{
						binding: 0, // @binding(0) in shader
						resource: { buffer: uniformBuffer }, // for grid
					},
					{
						binding: 1, // @binding(1) in shader
						resource: { buffer: cellStateStorage[0] }, // for cell state
					},
				],
			}),
			device.createBindGroup({
				label: "Cell renderer bind group B",
				layout: cellPipeline.getBindGroupLayout(0),
				entries: [
					{
						binding: 0,
						resource: { buffer: uniformBuffer },
					},
					{
						binding: 1,
						resource: { buffer: cellStateStorage[1] }, // same bind group with 2nd state storageBuffer
					},
				],
			}),
		];

		/*
		 * render the application
		 */
		function updateGrid() {
			step++;

			// records GPU commands
			const encoder = device.createCommandEncoder();

			// begin render pass
			const pass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: context.getCurrentTexture().createView(), //needs GPUTextureView instead of GPUTexture -> .createView()
						loadOp: "clear", // when render pass starts -> clear texture
						clearValue: { r: 0.15, g: 0.1, b: 0.25, a: 1 }, // Color
						storeOp: "store", // save/store any drawing from render pass into the texture
					},
				],
			});

			// render pipeline
			pass.setPipeline(cellPipeline);

			// our vertices
			pass.setVertexBuffer(0, vertexBuffer);

			// bind group for grid
			pass.setBindGroup(0, bindGroups[step % 2]);

			// number of vertices to render (6 vertices)
			pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

			// end render pass || still recording GPU calls for later, nothing done now
			pass.end();

			// create GPUCommandBuffer
			//const commandBuffer = encoder.finish();

			// sumbit in queue to GPU
			//device.queue.submit([commandBuffer]);

			// Finish the command buffer and immediately submit it. -> both together
			device.queue.submit([encoder.finish()]);
		}

		setInterval(updateGrid, UPDATE_INTERVAL);
	};

	return (
		<>
			<canvas ref={webGpuCanvas} width={512} height={512}></canvas>
		</>
	);
}

export default WebCanvas;
