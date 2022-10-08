function getRotationPrecomputeL(precompute_L, rotationMatrix){
	let R = mat4Matrix2mathMatrix(rotationMatrix)
	let M3 = computeSquareMatrix_3by3(R);
	let M5 = computeSquareMatrix_5by5(R);

	let L = math.matrix(precompute_L);

	let B1 = math.subset(L, math.index(math.range(1, 4), math.range(0, 3)));
	B1 = math.multiply(M3, B1);
	L = math.subset(L, math.index(math.range(1, 4), math.range(0, 3)), B1);

	let B2 = math.subset(L, math.index(math.range(4, 9), math.range(0, 3)));
	B2 = math.multiply(M5, B2);
	L = math.subset(L, math.index(math.range(4, 9), math.range(0, 3)), B2);

	let colorMat3 = [];
    for(var i = 0; i<3; i++){
        colorMat3[i] = mat3.fromValues( L.get([0, i]), L.get([1, i]), L.get([2, i]),
		L.get([3, i]), L.get([4, i]), L.get([5, i]),
		L.get([6, i]), L.get([7, i]), L.get([8, i]) ); 
	}
    return colorMat3;
}

function computeSquareMatrix_3by3(rotationMatrix){ // 计算方阵SA(-1) 3*3 
	let R = math.matrix(rotationMatrix);

	// 1、pick ni - {ni}
	let n1 = [1, 0, 0, 0]; let n2 = [0, 0, 1, 0]; let n3 = [0, 1, 0, 0];

	// 2、{P(ni)} - A  A_inverse
	let Pn1 = SHEval(n1[0], n1[1], n1[2], 3);
	let Pn2 = SHEval(n2[0], n2[1], n2[2], 3);
	let Pn3 = SHEval(n3[0], n3[1], n3[2], 3);

	let A = math.matrixFromRows(Pn1, Pn2, Pn3);
	let A_1 = math.pinv(A);

	// 3、用 R 旋转 ni - {R(ni)}
	let Rn1 = math.multiply(R, n1);
	let Rn2 = math.multiply(R, n2);
	let Rn3 = math.multiply(R, n3);

	// 4、R(ni) SH投影 - S
	let PRn1 = SHEval(Rn1.get([0]), Rn1.get([1]), Rn1.get([2]), 3);
	let PRn2 = SHEval(Rn2.get([0]), Rn2.get([1]), Rn2.get([2]), 3);
	let PRn3 = SHEval(Rn3.get([0]), Rn3.get([1]), Rn3.get([2]), 3);

	let S = math.matrixFromRows(PRn1, PRn2, PRn3);

	// 5、S*A_inverse
	return math.multiply(S, A_1);
}	

function computeSquareMatrix_5by5(rotationMatrix){ // 计算方阵SA(-1) 5*5
	let R = math.matrix(rotationMatrix);

	// 1、pick ni - {ni}
	let k = 1 / math.sqrt(2);
	let n1 = [1, 0, 0, 0]; let n2 = [0, 0, 1, 0]; let n3 = [k, k, 0, 0]; 
	let n4 = [k, 0, k, 0]; let n5 = [0, k, k, 0];

	// 2、{P(ni)} - A  A_inverse
	let Pn1 = SHEval(n1[0], n1[1], n1[2], 3);
	let Pn2 = SHEval(n2[0], n2[1], n2[2], 3);
	let Pn3 = SHEval(n3[0], n3[1], n3[2], 3);
	let Pn4 = SHEval(n4[0], n4[1], n4[2], 3);
	let Pn5 = SHEval(n5[0], n5[1], n5[2], 3);

	let A = math.matrixFromRows(Pn1, Pn2, Pn3, Pn4, Pn5);
	let A_1 = math.pinv(A);

	// 3、用 R 旋转 ni - {R(ni)}
	let Rn1 = math.multiply(R, n1);
	let Rn2 = math.multiply(R, n2);
	let Rn3 = math.multiply(R, n3);
	let Rn4 = math.multiply(R, n4);
	let Rn5 = math.multiply(R, n5);

	// 4、R(ni) SH投影 - S
	let PRn1 = SHEval(Rn1.get([0]), Rn1.get([1]), Rn1.get([2]), 3);
	let PRn2 = SHEval(Rn2.get([0]), Rn2.get([1]), Rn2.get([2]), 3);
	let PRn3 = SHEval(Rn3.get([0]), Rn3.get([1]), Rn3.get([2]), 3);
	let PRn4 = SHEval(Rn4.get([0]), Rn4.get([1]), Rn4.get([2]), 3);
	let PRn5 = SHEval(Rn5.get([0]), Rn5.get([1]), Rn5.get([2]), 3);

	let S = math.matrixFromRows(PRn1, PRn2, PRn3, PRn4, PRn5);

	// 5、S*A_inverse
	return math.multiply(S, A_1);
}

function mat4Matrix2mathMatrix(rotationMatrix){
	let mathMatrix = [];
	for(let i = 0; i < 4; i++){
		let r = [];
		for(let j = 0; j < 4; j++){
			r.push(rotationMatrix[i*4+j]);
		}
		mathMatrix.push(r);
	}
	return math.matrix(mathMatrix)
}

function getMat3ValueFromRGB(precomputeL){
    let colorMat3 = [];
    for(var i = 0; i<3; i++){
        colorMat3[i] = mat3.fromValues( precomputeL[0][i], precomputeL[1][i], precomputeL[2][i],
										precomputeL[3][i], precomputeL[4][i], precomputeL[5][i],
										precomputeL[6][i], precomputeL[7][i], precomputeL[8][i] ); 
	}
    return colorMat3;
}