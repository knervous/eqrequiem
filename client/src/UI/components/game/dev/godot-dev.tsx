import React, { useEffect, useState, useCallback, memo } from 'react';
import { Box, Typography, createTheme, ThemeProvider, TextField } from '@mui/material';
import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { Allotment } from 'allotment';
import { Node } from 'godot'; // Adjust import based on your Godot JS/TS API
import GameManager from '@game/Manager/game-manager';

import 'allotment/dist/style.css'; // Required for Allotment styling

// Dark theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0b0b0',
    },
    divider: '#424242',
  },
  components: {
    MuiTreeItem: {
      styleOverrides: {
        root: {
          '& .MuiTreeItem-content': {
            padding: '5px',
            '&:hover': {
              backgroundColor: '#333333',
            },
          },
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          color: '#ffffff',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputBase-root': {
            color: '#ffffff',
            backgroundColor: '#2a2a2a',
          },
          '& .MuiInputLabel-root': {
            color: '#b0b0b0',
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#424242',
          },
        },
      },
    },
  },
});

interface TreeNode {
  id: string;
  name: string;
  type: string;
  children?: TreeNode[];
}

interface Property {
  name: string;
  value: string | number;
  type: 'string' | 'number';
}

interface GodotDevComponentProps {
  rootScene: Node;
}

// Memoized TreeItem component
const MemoizedTreeItem = memo(
  ({
    node,
    level,
    renderTree,
    onSelectNode,
  }: {
    node: TreeNode;
    level: number;
    renderTree: (nodes: TreeNode[], level: number) => JSX.Element[];
    onSelectNode: (nodeId: string, godotNode: Node | null) => void;
  }) => {
    const godotNode = node;

    const labelContent = (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {node.children ? (
            null
          ) : (
            <InsertDriveFileIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
          )}
          <Typography variant="body2" sx={{ fontWeight: 'inherit', color: 'text.primary' }}>
            {node.name} ({node.type})
          </Typography>
        </Box>
      </Box>
    );

    return (
      <TreeItem
        key={node.id}
        itemId={node.id}
        label={labelContent}
        sx={{ '& > div': { padding: '5px 5px' } }}
        onClick={() => {
          if (!node.children) {
            onSelectNode(node.id, GameManager.instance?.get_parent().get_node(godotNode.id));
          }
        }}
      >
        {node.children && node.children.length > 0 ? renderTree(node.children, level + 1) : null}
      </TreeItem>
    );
  },
  (prevProps, nextProps) =>
    prevProps.node.id === nextProps.node.id &&
    prevProps.node.name === nextProps.node.name &&
    prevProps.node.type === nextProps.node.type &&
    prevProps.node.children === nextProps.node.children &&
    prevProps.level === nextProps.level,
);

export const GodotDevComponent: React.FC<GodotDevComponentProps> = ({ rootScene }) => {
  const [treeData, setTreeData] = useState<TreeNode[] | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<{ id: string; godotNode: Node | null } | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);

  const buildSceneTree = (node: Node, parentPath: string = ''): TreeNode => {
    const nodeName = node.get_name() || 'Unnamed';
    const nodeType = node.get_class();
    const currentPath = parentPath ? `${parentPath}/${nodeName}` : nodeName;

    const children: TreeNode[] = [];
    const childCount = node.get_child_count();
    for (let i = 0; i < childCount; i++) {
      const child = node.get_child(i);
      if (child) {
        children.push(buildSceneTree(child, currentPath));
      }
    }

    return {
      id: currentPath,
      name: nodeName,
      type: nodeType,
      children: children.length > 0 ? children : undefined,
    };
  };

  // Find Godot node by path
  const findGodotNodeByPath = (path: string): Node | null => {
    const parts = path.split('/');
    let currentNode = rootScene;
    for (const part of parts.slice(1)) {
      let found = false;
      for (let i = 0; i < currentNode.get_child_count(); i++) {
        const child = currentNode.get_child(i);
        if (child && child.get_name() === part) {
          currentNode = child;
          found = true;
          break;
        }
      }
      if (!found) return null;
    }
    return currentNode;
  };

  // Fetch properties using Godot's property list
  const fetchProperties = useCallback((godotNode: Node | null): Property[] => {
    if (!godotNode) return [];
    const properties: Property[] = [];
  
    // Get the property list and convert to JS objects
    const propList = godotNode.get_property_list().toArray().map((a) => a.toObject());
    console.log('PROPERTY LIST', propList);

    if (!propList || !Array.isArray(propList)) return [];
    // Filter and process properties
    propList.forEach((prop: any) => {
      const { name, type } = prop;
  
      const value = godotNode.get(name);
      if (value !== undefined && value !== null && typeof value !== 'object') {
        properties.push({
          name,
          value,
          type: type === 4 ? 'string' : 'number',
        });
      }
      
    });
  
    return properties;
  }, []);
  
  // Handle property change
  const handlePropertyChange = useCallback(
    (godotNode: Node | null, propName: string, type: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!godotNode) return;
      const value = type === 'number' ? parseFloat(event.target.value) : event.target.value;
      if (type === 'number' && isNaN(value)) return;
      godotNode.set(propName, value);
    },
    [],
  );
  // Handle node selection
  const handleSelectNode = useCallback(
    (nodeId: string, godotNode: Node | null) => {
      setSelectedNode({ id: nodeId, godotNode });
      setProperties(fetchProperties(godotNode));
    },
    [fetchProperties],
  );

  useEffect(() => {
    if (rootScene) {
      const tree = [buildSceneTree(rootScene)];
      setTreeData(tree);
    }
  }, [rootScene]);

  // Memoized renderTree function
  const renderTree = useCallback(
    (nodes: TreeNode[], level = 0): JSX.Element[] =>
      nodes.map((node) => (
        <MemoizedTreeItem
          key={node.id}
          node={node}
          level={level}
          renderTree={renderTree}
          onSelectNode={handleSelectNode}
        />
      )),
    [handleSelectNode],
  );

  // Handle expand/collapse
  const handleToggle = useCallback((event: React.SyntheticEvent, nodeIds: string[]) => {
    setExpanded(nodeIds);
  }, []);

  return (
    <ThemeProvider theme={darkTheme}>
      <Box
        sx={{
          height: '100vh',
          bgcolor: 'background.default',
          color: 'text.primary',
          padding: '10px',
        }}
      >
        <Typography variant="h6" sx={{ mb: 2 }}>
          Godot Scene Tree
        </Typography>
        <Allotment defaultSizes={[200, 300]}>
          <Allotment.Pane minSize={100} maxSize={400}>
            <SimpleTreeView
              slots={{
                expandIcon: ChevronRightIcon,
                collapseIcon: ExpandMoreIcon,
                groupTransition: null,
              }}
              expanded={expanded}
              onExpandedChange={handleToggle}
              sx={{
                height: 'calc(100% - 40px)',
                padding: '5px',
                color: 'text.primary',
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                overflow: 'auto',
                '& .MuiTreeItem-root': {
                  color: 'text.primary',
                },
              }}
            >
              {treeData ? (
                renderTree(treeData)
              ) : (
                <Typography variant="body2">Loading scene tree...</Typography>
              )}
            </SimpleTreeView>
          </Allotment.Pane>
          <Allotment.Pane minSize={100}>
            <Box
              sx={{
                height: '100%',
                bgcolor: 'background.paper',
                p: 2,
                overflow: 'auto',
              }}
            >
              {selectedNode ? (
                <>
                  <Typography variant="subtitle1" sx={{ mb: 2 }}>
                    Properties for {selectedNode.id} ({selectedNode.godotNode?.get_class?.()})
                  </Typography>
                  {properties.length > 0 ? (
                    properties.map((prop) => (
                      <Box key={prop.name} sx={{ mb: 2 }}>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          {prop.name} ({prop.type})
                        </Typography>
                        <TextField
                          fullWidth
                          variant="outlined"
                          type={prop.type === 'number' ? 'number' : 'text'}
                          defaultValue={prop.value}
                          onChange={handlePropertyChange(selectedNode.godotNode, prop.name, prop.type)}
                          size="small"
                        />
                      </Box>
                    ))
                  ) : (
                    <Typography variant="body2">No editable properties available.</Typography>
                  )}
                </>
              ) : (
                <Typography variant="body2">Select a leaf node to view properties.</Typography>
              )}
            </Box>
          </Allotment.Pane>
        </Allotment>
      </Box>
    </ThemeProvider>
  );
};