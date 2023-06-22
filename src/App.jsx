import "./App.css";

function App() {
	return (
		<>
			<h1>WebGPU - test</h1>
			<div className="card-full">
				{!navigator.gpu ? (
					<div className="support-error">
						It seems like your current browser{" "}
						<a
							href="https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility"
							target="_blank"
							rel="noreferrer"
						>
							does not support WebGPU
						</a>
					</div>
				) : (
					<canvas width={512} height={512}></canvas>
				)}
			</div>
		</>
	);
}

export default App;
