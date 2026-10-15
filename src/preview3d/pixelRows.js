export function rgbaTopToBottom(pixels,width=64,height=64){
  const stride=width*4,out=new Uint8Array(pixels.length);
  for(let y=0;y<height;y++)out.set(pixels.subarray(y*stride,(y+1)*stride),(height-1-y)*stride);
  return out;
}
