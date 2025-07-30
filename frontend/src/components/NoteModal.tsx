import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Button,
  Text,
  Box,
  HStack,
  VStack,
  IconButton,
  Spinner,
  Alert,
  AlertIcon,
  Divider,
  Badge
} from '@chakra-ui/react';
import { FaCopy, FaVolumeUp, FaPause, FaRedo, FaFileAlt } from 'react-icons/fa';
import { getNote, generateSummary } from '../api/apiClient';

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteId: string;
}

interface Note {
  id: string;
  content: string;
  summary?: string;
  source_title?: string;
  source_url?: string;
  domain?: string;
  created_at: string;
}

export default function NoteModal({ isOpen, onClose, noteId }: NoteModalProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [playingNote, setPlayingNote] = useState(false);
  const [playingSummary, setPlayingSummary] = useState(false);
  const [utterance, setUtterance] = useState<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (isOpen && noteId) {
      fetchNote();
    }
  }, [isOpen, noteId]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const fetchNote = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getNote(noteId);
      setNote(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load note');
    }
    setLoading(false);
  };

  const handleGenerateSummary = async () => {
    if (!note) return;
    setGeneratingSummary(true);
    try {
      const data = await generateSummary(note.id);
      // Check if summary is unavailable
      if (data.summary === "unavailable") {
        setNote({ ...note, summary: "unavailable" });
      } else {
        setNote({ ...note, summary: data.summary });
      }
    } catch (e: any) {
      setError(e.message || 'Failed to generate summary');
    }
    setGeneratingSummary(false);
  };

  const handlePlayPauseNote = () => {
    if (!note) return;
    
    if (playingNote) {
      window.speechSynthesis.pause();
      setPlayingNote(false);
    } else {
      window.speechSynthesis.cancel();
      const u = new window.SpeechSynthesisUtterance(note.content);
      u.onend = () => setPlayingNote(false);
      u.onpause = () => setPlayingNote(false);
      u.onresume = () => setPlayingNote(true);
      window.speechSynthesis.speak(u);
      setUtterance(u);
      setPlayingNote(true);
    }
  };

  const handlePlayPauseSummary = () => {
    if (!note?.summary) return;
    
    if (playingSummary) {
      window.speechSynthesis.pause();
      setPlayingSummary(false);
    } else {
      window.speechSynthesis.cancel();
      const u = new window.SpeechSynthesisUtterance(note.summary);
      u.onend = () => setPlayingSummary(false);
      u.onpause = () => setPlayingSummary(false);
      u.onresume = () => setPlayingSummary(true);
      window.speechSynthesis.speak(u);
      setUtterance(u);
      setPlayingSummary(true);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getDisplayDomain = (domain: string) => {
    if (domain === 'mhjfbmdgcfjbbpaeojofohoefgiehjai' || domain === 'local-file') {
      return 'Downloaded/Local file';
    }
    return domain;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack justify="space-between" align="center">
            <Text>Note Details</Text>
            <ModalCloseButton position="static" />
          </HStack>
        </ModalHeader>
        <ModalBody pb={6}>
          {loading && <Spinner size="lg" />}
          {error && <Alert status="error" mb={4}><AlertIcon />{error}</Alert>}
          {note && (
            <VStack spacing={4} align="stretch">
              {/* Note Info */}
              <Box>
                <HStack justify="space-between" mb={2}>
                  <Badge colorScheme="blue">{getDisplayDomain(note.domain || 'Unknown')}</Badge>
                  <Text fontSize="sm" color="gray.500">
                    {new Date(note.created_at).toLocaleDateString()}
                  </Text>
                </HStack>
                {note.source_title && (
                  <Text fontSize="sm" color="gray.600" mb={2}>
                    Source: {note.source_title}
                  </Text>
                )}
              </Box>

              {/* Note Content */}
              <Box>
                <HStack justify="space-between" mb={2}>
                  <Text fontWeight="bold">Note Content</Text>
                  <Text fontSize="sm" color="gray.500">
                    {note.content.length} characters
                  </Text>
                </HStack>
                <Box 
                  p={3} 
                  bg="gray.50" 
                  borderRadius="md" 
                  maxH="200px" 
                  overflowY="auto"
                  border="1px solid"
                  borderColor="gray.200"
                >
                  <Text whiteSpace="pre-wrap">{note.content}</Text>
                </Box>
                <HStack mt={2} spacing={2}>
                  <IconButton
                    aria-label={playingNote ? 'Pause note' : 'Play note'}
                    icon={playingNote ? <FaPause /> : <FaVolumeUp />}
                    colorScheme={playingNote ? 'gray' : 'blue'}
                    size="sm"
                    onClick={handlePlayPauseNote}
                  />
                  <IconButton
                    aria-label="Copy note"
                    icon={<FaCopy />}
                    size="sm"
                    onClick={() => handleCopy(note.content)}
                  />
                </HStack>
              </Box>

              <Divider />

              {/* Summary Section */}
              <Box>
                <HStack justify="space-between" mb={2}>
                  <Text fontWeight="bold">Summary</Text>
                  {note.summary && note.summary !== "unavailable" && (
                    <Text fontSize="sm" color="gray.500">
                      {note.summary.length} characters
                    </Text>
                  )}
                </HStack>
                
                {note.summary ? (
                  note.summary === "unavailable" ? (
                    <Box 
                      p={3} 
                      bg="yellow.50" 
                      borderRadius="md" 
                      border="1px solid"
                      borderColor="yellow.200"
                    >
                      <Text color="yellow.800" fontSize="sm">
                        Summary unavailable - text may be too short or incomplete for summarization.
                      </Text>
                    </Box>
                  ) : (
                    <>
                      <Box 
                        p={3} 
                        bg="green.50" 
                        borderRadius="md" 
                        maxH="150px" 
                        overflowY="auto"
                        border="1px solid"
                        borderColor="green.200"
                      >
                        <Text whiteSpace="pre-wrap">{note.summary}</Text>
                      </Box>
                      <HStack mt={2} spacing={2}>
                        <IconButton
                          aria-label={playingSummary ? 'Pause summary' : 'Play summary'}
                          icon={playingSummary ? <FaPause /> : <FaVolumeUp />}
                          colorScheme={playingSummary ? 'gray' : 'green'}
                          size="sm"
                          onClick={handlePlayPauseSummary}
                        />
                        <IconButton
                          aria-label="Copy summary"
                          icon={<FaCopy />}
                          size="sm"
                          onClick={() => handleCopy(note.summary!)}
                        />
                      </HStack>
                    </>
                  )
                ) : (
                  <Button
                    leftIcon={generatingSummary ? <Spinner size="sm" /> : <FaFileAlt />}
                    colorScheme="green"
                    size="sm"
                    onClick={handleGenerateSummary}
                    isLoading={generatingSummary}
                    loadingText="Generating..."
                  >
                    Generate Summary
                  </Button>
                )}
              </Box>
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
} 