import { BaseEdge, EdgeProps, getSmoothStepPath } from '@xyflow/react';

export default function SimpleStepEdge(props: EdgeProps) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  } = props;

  let path = '';
  let labelX = 0;
  let labelY = 0;

  const isTopToBottom = sourcePosition === 'bottom' && targetPosition === 'top';
  const isBottomToTop = sourcePosition === 'top' && targetPosition === 'bottom';
  const isLeftToRight = sourcePosition === 'right' && targetPosition === 'left';
  const isRightToLeft = sourcePosition === 'left' && targetPosition === 'right';

  if ((isTopToBottom && targetY >= sourceY) || (isBottomToTop && targetY <= sourceY)) {
    const centerY = sourceY + (targetY - sourceY) / 2;
    path = `M ${sourceX} ${sourceY} L ${sourceX} ${centerY} L ${targetX} ${centerY} L ${targetX} ${targetY}`;
    labelX = sourceX + (targetX - sourceX) / 2;
    labelY = centerY;
  } else if ((isLeftToRight && targetX >= sourceX) || (isRightToLeft && targetX <= sourceX)) {
    const centerX = sourceX + (targetX - sourceX) / 2;
    path = `M ${sourceX} ${sourceY} L ${centerX} ${sourceY} L ${centerX} ${targetY} L ${targetX} ${targetY}`;
    labelX = centerX;
    labelY = sourceY + (targetY - sourceY) / 2;
  } else {
    const [defaultPath, dLabelX, dLabelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 0,
    });
    path = defaultPath;
    labelX = dLabelX;
    labelY = dLabelY;
  }

  return <BaseEdge {...props} path={path} labelX={labelX} labelY={labelY} />;
}
